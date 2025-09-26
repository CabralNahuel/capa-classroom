import React, { useState, useEffect } from 'react';
import { Grid, Card, CardContent, Typography, List, ListItem, ListItemText, CircularProgress, Alert, LinearProgress, Button, Box, Chip, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import api from '../../services/api';

const StudentDashboard = () => {
  const [courses, setCourses] = useState([]);
  const [summaries, setSummaries] = useState({}); // courseId -> { total, submitted, percent, pending[] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCourse, setDetailCourse] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const coursesRes = await api.get('/classroom/courses?role=student');
        const cs = coursesRes.data.data || [];
        setCourses(cs);

        // Fetch per-course student summaries (progress + pending)
        const sumPairs = await Promise.all(
          cs.map(async (course) => {
            try {
              const res = await api.get(`/classroom/courses/${course.id}/assignments/student-summary`);
              return [course.id, res.data?.data || { total: 0, submitted: 0, percent: 0, pending: [] }];
            } catch (e) {
              console.error('student-summary error', course.id, e);
              return [course.id, { total: 0, submitted: 0, percent: 0, pending: [] }];
            }
          })
        );
        const map = Object.fromEntries(sumPairs);
        setSummaries(map);

        setError(null);
      } catch (err) {
        setError('Failed to fetch data. Please try again later.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  // Aggregate upcoming from summaries (pending with dueDate)
  const upcoming = courses.flatMap(c => (summaries[c.id]?.pending || []).map(p => ({ ...p, courseId: c.id, courseName: c.name })) )
    .filter(p => p.dueDate && p.dueDate.year)
    .sort((a, b) => new Date(a.dueDate.year, a.dueDate.month - 1, a.dueDate.day) - new Date(b.dueDate.year, b.dueDate.month - 1, b.dueDate.day))
    .slice(0, 5);

  const getDueStatus = (due) => {
    if (!due || !due.year) return 'normal';
    const now = new Date();
    const d = new Date(due.year, due.month - 1, due.day, 23, 59, 59);
    const msDiff = d.getTime() - now.getTime();
    const days = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'overdue';
    if (days <= 2) return 'due_soon';
    return 'normal';
  };

  const statusStyles = (status) => {
    if (status === 'overdue') {
      return { bg: 'error.main', fg: '#fff', outline: 'contained' };
    }
    if (status === 'due_soon') {
      return { bg: 'error.light', fg: 'error.dark', outline: 'outlined' };
    }
    return { bg: 'transparent', fg: 'inherit', outline: 'outlined' };
  };

  // Sort courses by urgency: earliest pending due date first, then by name
  const sortedCourses = [...courses].sort((c1, c2) => {
    const p1 = (summaries[c1.id]?.pending || []).filter(p => p.dueDate && p.dueDate.year)
      .sort((a, b) => new Date(a.dueDate.year, a.dueDate.month - 1, a.dueDate.day) - new Date(b.dueDate.year, b.dueDate.month - 1, b.dueDate.day));
    const p2 = (summaries[c2.id]?.pending || []).filter(p => p.dueDate && p.dueDate.year)
      .sort((a, b) => new Date(a.dueDate.year, a.dueDate.month - 1, a.dueDate.day) - new Date(b.dueDate.year, b.dueDate.month - 1, b.dueDate.day));
    const d1 = p1[0] ? new Date(p1[0].dueDate.year, p1[0].dueDate.month - 1, p1[0].dueDate.day).getTime() : Number.POSITIVE_INFINITY;
    const d2 = p2[0] ? new Date(p2[0].dueDate.year, p2[0].dueDate.month - 1, p2[0].dueDate.day).getTime() : Number.POSITIVE_INFINITY;
    if (d1 !== d2) return d1 - d2;
    return (c1.name || '').localeCompare(c2.name || '');
  });

  return (
    <>
    <Grid container spacing={3}>
      <Grid item xs={12} md={7}>
        <Grid container spacing={2}>
          {sortedCourses.map(course => {
            const sum = summaries[course.id] || { total: 0, submitted: 0, percent: 0, pending: [] };
            const courseLink = course.alternateLink || `https://classroom.google.com/c/${course.id}`;
            // Find earliest pending with due date for visual cue
            const pendingSorted = [...(sum.pending || [])]
              .filter(p => p.dueDate && p.dueDate.year)
              .sort((a, b) => new Date(a.dueDate.year, a.dueDate.month - 1, a.dueDate.day) - new Date(b.dueDate.year, b.dueDate.month - 1, b.dueDate.day));
            const next = pendingSorted[0];
            const status = next ? getDueStatus(next.dueDate) : 'normal';
            const styles = statusStyles(status);
            return (
              <Grid key={course.id} item xs={12} sm={6}>
                <Card sx={{ height: 220, display: 'flex', borderLeft: status !== 'normal' ? 4 : 1, borderColor: status === 'overdue' ? 'error.main' : (status === 'due_soon' ? 'error.light' : 'divider') }}>
                  <CardContent sx={{ width: '100%' }}>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom noWrap>
                      {course.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                      {course.section || '—'}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {sum.submitted} / {sum.total} entregadas
                      </Typography>
                      <LinearProgress variant="determinate" value={sum.percent || 0} sx={{ mt: 0.5 }} />
                      <Typography variant="caption" align="right" display="block" sx={{ mt: 0.5 }}>
                        {sum.percent || 0}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Pendientes: {sum.pending?.length || 0}
                        {status === 'due_soon' && (
                          <span style={{ marginLeft: 8, color: '#b71c1c', fontWeight: 600 }}>Vence pronto</span>
                        )}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3, gap: 1, flexWrap: 'wrap' }}>
                      <Button variant="text" size="small" href={courseLink} target="_blank" rel="noopener noreferrer">
                        Abrir curso
                      </Button>
                      {/* Se eliminan acciones clickeables para "Vence pronto"; navegación desde "Próximas tareas" o "Ver detalle" */}
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={async () => {
                          try {
                            setDetailCourse(course);
                            setDetailOpen(true);
                            const res = await api.get(`/classroom/courses/${course.id}/assignments/student-list`);
                            setDetailItems(res.data?.data || []);
                          } catch (e) {
                            console.error(e);
                            setDetailItems([]);
                          }
                        }}
                      >
                        Ver detalle
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Grid>
      <Grid item xs={12} md={5}>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>Próximas tareas</Typography>
            <List>
              {upcoming.map(a => {
                const st = getDueStatus(a.dueDate);
                const style = statusStyles(st);
                const bg = st === 'normal' ? 'transparent' : style.bg;
                const fg = st === 'normal' ? 'inherit' : style.fg;
                return (
                  <ListItem
                    key={`${a.courseId}-${a.id}`}
                    button
                    component="a"
                    href={a.alternateLink || `https://classroom.google.com/c/${a.courseId}` }
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ bgcolor: bg, color: fg, borderRadius: 1, mb: 0.5 }}
                    secondaryAction={st === 'overdue' ? <Chip label="Vencida" color="error" size="small" /> : null}
                  >
                    <ListItemText
                      primary={a.title}
                      secondary={`Vence: ${new Date(a.dueDate.year, a.dueDate.month - 1, a.dueDate.day).toLocaleDateString()}`}
                    />
                  </ListItem>
                );
              })}
              {upcoming.length === 0 && (
                <ListItem>
                  <ListItemText primary="Sin tareas próximas" />
                </ListItem>
              )}
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
    <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>{detailCourse ? `Tareas — ${detailCourse.name}` : 'Tareas'}</DialogTitle>
      <DialogContent dividers>
        <List>
          {detailItems.map(it => {
            const st = it.status;
            const due = it.dueDate && it.dueDate.year ? new Date(it.dueDate.year, it.dueDate.month - 1, it.dueDate.day).toLocaleDateString() : 'Sin fecha';
            return (
              <ListItem key={it.id} button component="a" href={it.alternateLink || (detailCourse ? `https://classroom.google.com/c/${detailCourse.id}` : '#')} target="_blank" rel="noopener noreferrer">
                <ListItemText
                  primary={it.title}
                  secondary={`Due: ${due}`}
                />
                {st === 'overdue' && <Chip label="Vencida" color="error" size="small" />}
                {st === 'missing' && <Chip label="Falta" size="small" />}
                {st === 'delivered' && <Chip label="Entregada" color="success" size="small" />}
              </ListItem>
            );
          })}
          {detailItems.length === 0 && (
            <ListItem>
              <ListItemText primary="Sin tareas" />
            </ListItem>
          )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDetailOpen(false)}>Cerrar</Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default StudentDashboard;
