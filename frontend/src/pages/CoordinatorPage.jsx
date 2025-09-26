import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Container, Typography, Box, TextField, MenuItem, Button, CircularProgress, Alert, Stack, Chip, Tooltip } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import api from '../services/api';

const CoordinatorPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [q, setQ] = useState('');


  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (q) params.set('search', q);
      const res = await api.get(`/users?${params.toString()}`);
      const data = (res.data?.data || []).map(u => ({ ...u, id: u.id }));
      setRows(data);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('No se pudo cargar el listado de usuarios');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, q]);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (id, role) => {
    try {
      await api.put(`/users/${id}/role`, { role });
      await load();
    } catch (e) {
      console.error(e);
      setError('No se pudo actualizar el rol');
    }
  };


  const columns = useMemo(() => ([
    { field: 'name', headerName: 'Nombre', flex: 1, minWidth: 180 },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 200, valueGetter: (p) => p.row.email || '—' },
    {
      field: 'role', headerName: 'Rol', width: 120,
      renderCell: (p) => <Chip size="small" label={p.value} color={p.value === 'coordinator' ? 'warning' : p.value === 'teacher' ? 'primary' : 'default'} />
    },
    { field: 'last_login', headerName: 'Últ. acceso', width: 160, valueGetter: (p) => p.row.last_login ? new Date(p.row.last_login).toLocaleString() : '—' },
    {
      field: 'actions', headerName: 'Acciones', width: 260, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {p.row.role !== 'teacher' && (
            <Tooltip title="Cambiar rol a profesor">
              <Button size="small" variant="outlined" onClick={() => changeRole(p.row.id, 'teacher')}>Promover</Button>
            </Tooltip>
          )}
          {p.row.role !== 'student' && (
            <Tooltip title="Cambiar rol a alumno">
              <Button size="small" variant="outlined" color="secondary" onClick={() => changeRole(p.row.id, 'student')}>Revertir</Button>
            </Tooltip>
          )}
        </Stack>
      )
    }
  ]), []);


  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>Panel de Coordinación</Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <TextField size="small" label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <TextField size="small" select label="Rol" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="all">Todos</MenuItem>
          <MenuItem value="student">Alumno</MenuItem>
          <MenuItem value="teacher">Teacher</MenuItem>
          <MenuItem value="coordinator">Coordinador</MenuItem>
        </TextField>
        <Button variant="outlined" onClick={load}>Actualizar</Button>
      </Box>

      {loading ? (
        <CircularProgress />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <div style={{ width: '100%' }}>
          <DataGrid rows={rows} columns={columns} pageSize={25} rowsPerPageOptions={[25, 50, 100]} density="compact" autoHeight rowHeight={56} />
        </div>
      )}

    </Container>
  );
};

export default CoordinatorPage;
