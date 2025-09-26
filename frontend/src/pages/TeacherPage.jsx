import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Container, Typography, Button, CircularProgress, Alert, Stack } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import api from '../services/api';

// Esta página ahora es para el coordinador: listado de profesores y ver sus alumnos
const TeacherPage = () => {
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [teacherError, setTeacherError] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const loadTeachers = useCallback(async () => {
    try {
      setTeachersLoading(true);
      const res = await api.get('/reports/coordinator/teachers');
      const data = (res.data?.data || []).map((t) => ({ id: t.teacher_id, ...t }));
      setTeachers(data);
      setTeacherError(null);
      return data;
    } catch (e) {
      console.error(e);
      setTeacherError('No se pudo cargar la lista de profesores');
      return [];
    } finally {
      setTeachersLoading(false);
    }
  }, []);

  const loadTeacherStudents = useCallback(async (teacherId) => {
    try {
      setStudentsLoading(true);
      const res = await api.get(`/reports/coordinator/teacher-students/${teacherId}`);
      const data = (res.data?.data || []).map((s, idx) => ({ id: s.student_id || idx, ...s }));
      setStudents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const syncRoster = useCallback(async () => {
    try {
      setSyncLoading(true);
      await api.post('/reports/coordinator/sync-roster');
    } catch (e) {
      console.error(e);
    } finally {
      setSyncLoading(false);
    }
  }, []);

  useEffect(() => { loadTeachers(); }, [loadTeachers]);

  const teacherColumns = useMemo(() => ([
    { field: 'teacher_name', headerName: 'Profesor', flex: 1, minWidth: 200 },
    { field: 'teacher_email', headerName: 'Email', flex: 1, minWidth: 220 },
    { field: 'total_courses', headerName: 'Cursos', width: 110 },
    { field: 'total_students', headerName: 'Alumnos únicos', width: 160 },
    {
      field: 'actions', headerName: 'Acciones', width: 180, sortable: false, filterable: false,
      renderCell: (p) => (
        <Button size="small" variant="outlined" onClick={async () => {
          try {
            // Selecciona inmediatamente y limpia alumnos para feedback instantáneo
            setSelectedTeacher(p.row);
            setStudents([]);
            // Sincroniza cursos del profesor y luego matrícula general
            await api.post(`/reports/coordinator/sync-teacher-courses/${p.row.teacher_id}`);
            await syncRoster();
            // Carga alumnos del profesor seleccionado
            await loadTeacherStudents(p.row.teacher_id);
            // Refresca la lista de profesores y re-selecciona desde la lista nueva
            const updated = await loadTeachers();
            const found = updated.find(t => t.teacher_id === p.row.teacher_id);
            if (found) setSelectedTeacher(found);
          } catch (e) {
            console.error(e);
          }
        }}>Ver alumnos</Button>
      )
    }
  ]), [loadTeacherStudents]);

  const studentColumns = useMemo(() => ([
    { field: 'student_name', headerName: 'Alumno', flex: 1, minWidth: 200 },
    { field: 'student_email', headerName: 'Email', flex: 1, minWidth: 220 },
  ]), []);

  return (
    <Container maxWidth="lg">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">Profesores y alumnos (Classroom)</Typography>
      </Stack>

      {teacherError && <Alert severity="error" sx={{ mb: 2 }}>{teacherError}</Alert>}
      {teachersLoading ? (
        <CircularProgress />
      ) : (
        <div style={{ width: '100%', marginBottom: 16 }}>
          <DataGrid rows={teachers} columns={teacherColumns} pageSize={10} rowsPerPageOptions={[10, 25, 50]} density="compact" autoHeight rowHeight={56} />
        </div>
      )}

      {selectedTeacher && (
        <>
          <Typography variant="h6" gutterBottom>
            Alumnos de {selectedTeacher.teacher_name} ({students.length})
          </Typography>
          {studentsLoading ? (
            <CircularProgress />
          ) : (
            <div style={{ width: '100%' }}>
              <DataGrid rows={students} columns={studentColumns} pageSize={25} rowsPerPageOptions={[25, 50, 100]} density={"compact"} autoHeight rowHeight={56} />
            </div>
          )}
        </>
      )}
    </Container>
  );
};

export default TeacherPage;
