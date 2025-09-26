import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Grid, Card, CardContent, CircularProgress, Alert, Button, Box, LinearProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Link as RouterLink } from 'react-router-dom';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import api from '../services/api';

const CoursePage = () => {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const courseRes = await api.get(`/classroom/courses/${courseId}`);
        setCourse(courseRes.data.data);

        // Optimized single call for all assignments with progress
        const summaryRes = await api.get(`/classroom/courses/${courseId}/assignments/progress-summary`);
        setAssignments(summaryRes.data?.data || []);
        setStudents([]);

        setError(null);
      } catch (err) {
        setError('Failed to fetch course data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [courseId]);

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setError(null) || setLoading(false) || window.location.reload()}>Reintentar</Button>}>
        {error}
      </Alert>
    );
  }

  // No mostramos la tabla de estudiantes aquí; solo se ve en Métricas/Progreso

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>{course?.name}</Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>{course?.section}</Typography>
      <Typography variant="body1" paragraph>{course?.description}</Typography>

      {/* Botón general de progreso eliminado a pedido: ahora el detalle se ve por tarea */}

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {assignments.map((assignment) => (
          <Grid key={assignment.id} item xs={12} md={6} lg={4}>
            <Card sx={{ height: 220, display: 'flex' }}>
              <CardContent sx={{ width: '100%' }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom noWrap>
                  {assignment.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  Due: {assignment.dueDate ? new Date(assignment.dueDate.year, assignment.dueDate.month - 1, assignment.dueDate.day).toLocaleDateString() : 'No due date'}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {assignment.progress?.submitted || 0} / {assignment.progress?.total || 0} entregadas
                  </Typography>
                  <LinearProgress variant="determinate" value={assignment.progress?.percent || 0} sx={{ mt: 0.5 }} />
                  <Typography variant="caption" sx={{ float: 'right', mt: 0.5 }}>
                    {assignment.progress?.percent || 0}%
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3, gap: 1.5, flexWrap: 'wrap' }}>
                  <Button
                    variant="text"
                    size="medium"
                    href={assignment.alternateLink || `https://classroom.google.com/c/${courseId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir en Classroom
                  </Button>
                  <Button
                    variant="outlined"
                    size="medium"
                    component={RouterLink}
                    to={`/courses/${courseId}/assignments/${assignment.id}/progress`}
                  >
                    Ver detalle
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};

export default CoursePage;
