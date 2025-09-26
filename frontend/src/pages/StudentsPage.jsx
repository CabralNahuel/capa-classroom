import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Container, Typography, Box, TextField, MenuItem, Chip, Stack, Drawer, List, ListItem, ListItemText, IconButton, CircularProgress, Alert, Button } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import CloseIcon from '@mui/icons-material/Close';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const StudentsPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [q, setQ] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all'); // all | delivered | missing
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState({ name: '', missingDetails: [] });


  const { user } = useAuth();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      let data = [];
      if (user?.role === 'coordinator') {
        // Trigger a quick roster sync to ensure we include newly discovered rosters
        try { await api.post('/reports/coordinator/sync-roster'); } catch (e) { /* ignore to avoid blocking UI */ }
        // Incluye todos los alumnos desde la matrícula cacheada (course_students)
        const res = await api.get('/reports/coordinator/students');
        const rows = res.data?.data || [];
        data = rows.map(r => ({
          userId: r.userId,
          name: r.name || '—',
          email: r.email || '—',
          courses: r.courses || [],
          totalAssignments: 0,
          submittedCount: 0,
          missingCount: 0,
          averageGrade: null,
          missingDetails: [],
          id: r.userId,
        }));
      } else {
        // Vista original (profesor): basado en API en vivo y submissions
        const res = await api.get('/reports/students-overview');
        const rows = res.data?.data || [];
        data = rows.map(s => ({
          ...s,
          id: s.userId,
        }));
      }
      setRows(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('No se pudo cargar el resumen de estudiantes');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const hasAnyEmail = useMemo(() => rows.some(r => r.email && r.email !== '—'), [rows]);

  const allCourses = useMemo(() => {
    const set = new Map();
    rows.forEach(r => (r.courses || []).forEach(c => set.set(c.courseId, c.courseName)));
    return [{ courseId: 'all', courseName: 'Todos los cursos' }, ...Array.from(set, ([courseId, courseName]) => ({ courseId, courseName }))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      // Text filter (solo por nombre)
      if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
      // Course filter
      if (courseFilter !== 'all') {
        const inCourse = (r.courses || []).some(c => c.courseId === courseFilter);
        if (!inCourse) return false;
      }
      // State filter delivered/missing
      if (stateFilter === 'delivered' && (!r.submittedCount || r.submittedCount <= 0)) return false;
      if (stateFilter === 'missing' && (!r.missingCount || r.missingCount <= 0)) return false;
      // Date range filter uses missingDetails dueDate
      if (from || to) {
        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        const details = r.missingDetails || [];
        const anyInRange = details.some(d => {
          if (!d.dueDate) return false;
          const dd = new Date(d.dueDate);
          if (fromDate && dd < fromDate) return false;
          if (toDate && dd > toDate) return false;
          return true;
        });
        // Si se filtra por fechas, mostramos solo quienes tienen faltantes en ese rango
        if (!(anyInRange || (!details.length && stateFilter !== 'missing'))) return false;
      }
      return true;
    });
  }, [rows, q, courseFilter, stateFilter, from, to]);

  const columnsBase = [
    { field: 'name', headerName: 'Estudiante', flex: 1, minWidth: 200 },
    {
      field: 'courses',
      headerName: 'Cursos',
      flex: 1.4,
      minWidth: 260,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
          {(params.value || []).map(c => (
            <Chip key={c.courseId} label={c.courseName} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
          ))}
        </Stack>
      ),
      sortable: false,
      filterable: false,
    },
    { field: 'totalAssignments', headerName: 'Total', width: 100, type: 'number' },
    { field: 'submittedCount', headerName: 'Entregadas', width: 120, type: 'number' },
    { field: 'missingCount', headerName: 'Faltantes', width: 110, type: 'number' },
    {
      field: 'averageGrade',
      headerName: 'Promedio',
      width: 120,
      valueGetter: (p) => (typeof p.row.averageGrade === 'number' ? Number(p.row.averageGrade).toFixed(2) : '—'),
    },
    {
      field: 'actions',
      headerName: 'Acciones',
      width: 140,
      renderCell: (params) => (
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            setDrawerData({ name: params.row.name, missingDetails: params.row.missingDetails || [] });
            setDrawerOpen(true);
          }}
        >
          Ver faltantes
        </Button>
      ),
      sortable: false,
      filterable: false,
    },
  ];

  const columns = useMemo(() => {
    if (hasAnyEmail) {
      return [
        columnsBase[0],
        { field: 'email', headerName: 'Email', flex: 1, minWidth: 220, valueGetter: (p) => (p.row.email && p.row.email !== '—' ? p.row.email : 'N/D') },
        ...columnsBase.slice(1),
      ];
    }
    return columnsBase;
  }, [hasAnyEmail]);

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>Estudiantes</Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          size="small"
          label="Buscar alumno"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <TextField
          size="small"
          select
          label="Curso"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          {allCourses.map(c => (
            <MenuItem key={c.courseId} value={c.courseId}>{c.courseName}</MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          select
          label="Estado"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="all">Todos</MenuItem>
          <MenuItem value="delivered">Entregó</MenuItem>
          <MenuItem value="missing">Falta</MenuItem>
        </TextField>
        <TextField size="small" type="date" label="Desde" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField size="small" type="date" label="Hasta" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} />
      </Box>

      <div style={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={filteredRows.map(r => ({ ...r, id: r.userId }))}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={25}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </div>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 420, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Faltantes — {drawerData.name}</Typography>
            <IconButton onClick={() => setDrawerOpen(false)}><CloseIcon /></IconButton>
          </Box>
          {(drawerData.missingDetails?.length || 0) === 0 ? (
            <Typography color="text.secondary" sx={{ mt: 2 }}>Sin faltantes</Typography>
          ) : (
            <List>
              {drawerData.missingDetails.map((m, idx) => (
                <ListItem key={`${m.courseId}-${m.assignmentId}-${idx}`} alignItems="flex-start">
                  <ListItemText
                    primary={`${m.title} — ${m.courseName}`}
                    secondary={m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'Sin fecha'}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Drawer>

    </Container>
  );
};

export default StudentsPage;
