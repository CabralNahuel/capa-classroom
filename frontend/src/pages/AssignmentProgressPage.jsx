import React, { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Container, Typography, CircularProgress, Alert, Box, Paper, TextField, ToggleButton, ToggleButtonGroup, Stack } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import api from '../services/api';

const AssignmentProgressPage = () => {
  const { courseId, assignmentId } = useParams();
  const [course, setCourse] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterState, setFilterState] = useState('all'); // all | delivered | missing
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Course and assignment details (assignment details from all course assignments)
        const [courseRes, assigRes, studentsRes, subsRes] = await Promise.all([
          api.get(`/classroom/courses/${courseId}`),
          api.get(`/classroom/courses/${courseId}/assignments`),
          api.get(`/classroom/courses/${courseId}/students`),
          api.get(`/classroom/courses/${courseId}/assignments/${assignmentId}/submissions`),
        ]);

        setCourse(courseRes.data.data);
        const assig = (assigRes.data.data || []).find(a => String(a.id) === String(assignmentId));
        setAssignment(assig || null);

        const students = (studentsRes.data.data || []); // keep userId & profile
        const submissions = subsRes.data.data || [];

        const byUser = new Map();
        submissions.forEach(s => byUser.set(String(s.userId), s));

        // If assignment is only for individual students, filter by those IDs
        const assigneeIds = assig && assig.assigneeMode === 'INDIVIDUAL_STUDENTS'
          ? (assig.individualStudentsOptions?.studentIds || []).map(String)
          : null;
        const baseStudents = assigneeIds
          ? students.filter(s => assigneeIds.includes(String(s.userId)))
          : students;

        const table = baseStudents.map(s => {
          const profile = s.profile || {};
          const uid = String(s.userId);
          const sub = byUser.get(uid) || null;
          const state = sub?.state || 'CREATED';
          const grade = sub?.assignedGrade ?? sub?.draftGrade ?? null;
          const turnedIn = state === 'TURNED_IN' || state === 'RETURNED';
          return {
            userId: uid,
            name: profile.name?.fullName || '—',
            email: profile.emailAddress || '—',
            state,
            turnedIn,
            grade,
            updateTime: sub?.updateTime ? new Date(sub.updateTime).toLocaleString() : '—',
          };
        });

        setRows(table);
        setError(null);
      } catch (err) {
        console.error(err);
        setError('No se pudo cargar el progreso de la tarea.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [courseId, assignmentId, reloadKey]);

  if (loading) return <CircularProgress/>;
  if (error) return (
    <Alert severity="error" action={<Box><TextField size="small" type="button" onClick={() => setReloadKey(k => k + 1)} value="Reintentar" /></Box>}>
      {error}
    </Alert>
  );

  const columns = [
    { field: 'name', headerName: 'Student Name', width: 220 },
    { field: 'total', headerName: 'Total Assignments', width: 180 },
    { field: 'submitted', headerName: 'Submitted', width: 140 },
    { field: 'missing', headerName: 'Missing', width: 120 },
    { 
      field: 'completion',
      headerName: 'Completion (%)',
      width: 160,
      valueGetter: (p) => p.row.completion,
    },
  ];

  // Compute completion
  const total = rows.length;
  const submitted = rows.filter(r => r.turnedIn).length;
  const percent = total ? Math.round((submitted / total) * 100) : 0;

  // Filtered rows for grid
  const gridRows = rows
    .filter(r => {
      if (filterState === 'delivered' && !r.turnedIn) return false;
      if (filterState === 'missing' && r.turnedIn) return false;
      if (query) {
        const q = query.toLowerCase();
        const name = (r.name || '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    })
    .map(r => ({
      id: r.userId,
      name: r.name,
      total: 1,
      submitted: r.turnedIn ? 1 : 0,
      missing: r.turnedIn ? 0 : 1,
      completion: r.turnedIn ? 100 : 0,
    }))
    .sort((a, b) => (b.missing - a.missing) || a.name.localeCompare(b.name));

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>
        {course?.name} — {assignment?.title || 'Tarea'}
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Completado: {submitted}/{total} ({percent}%)
      </Typography>

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <ToggleButtonGroup
          value={filterState}
          exclusive
          onChange={(e, val) => val && setFilterState(val)}
          size="small"
        >
          <ToggleButton value="all">Todos</ToggleButton>
          <ToggleButton value="delivered">Entregó</ToggleButton>
          <ToggleButton value="missing">Falta</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          label="Buscar alumno"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ maxWidth: 280 }}
        />
      </Stack>

      <Box sx={{ mt: 2 }}>
        <Paper style={{ height: 520, width: '100%' }}>
          <DataGrid
            rows={gridRows}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[10]}
            getRowId={(row) => row.id}
            getRowClassName={(params) => (params.row.missing ? 'row-missing' : (params.row.completion === 100 ? 'row-complete' : ''))}
            sx={{
              '& .row-missing .MuiDataGrid-cell': { color: 'error.main' },
              '& .row-complete .MuiDataGrid-cell': { color: 'success.main' },
            }}
          />
        </Paper>
      </Box>
    </Container>
  );
};

export default AssignmentProgressPage;
