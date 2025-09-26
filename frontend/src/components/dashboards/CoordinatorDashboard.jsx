import React, { useState, useEffect } from 'react';
import { Grid, Card, CardContent, Typography, CircularProgress, Alert } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../services/api';

const CoordinatorDashboard = () => {
  const [stats, setStats] = useState(null);
  const [byCourse, setByCourse] = useState([]);
  const [byStudent, setByStudent] = useState([]);
  const [byTeacher, setByTeacher] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const statsRes = await api.get('/reports/dashboard/overview');
        setStats(statsRes.data.data);

        // Load analytics datasets
        const [cRes, sRes, tRes] = await Promise.all([
          api.get('/reports/analytics/courses'),
          api.get('/reports/analytics/students'),
          api.get('/reports/analytics/teachers')
        ]);
        setByCourse(cRes.data?.data || []);
        setByStudent(sRes.data?.data || []);
        setByTeacher(tRes.data?.data || []);
        setError(null);
      } catch (err) {
        setError('No se pudieron cargar los datos del tablero.');
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

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Typography variant="h6">Estudiantes</Typography>
            <Typography variant="h4">{stats?.basicStats.total_students}</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Typography variant="h6">Docentes</Typography>
            <Typography variant="h4">{stats?.basicStats.total_teachers}</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Typography variant="h6">Cursos activos</Typography>
            <Typography variant="h4">{stats?.basicStats.active_courses}</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Typography variant="h6">Tareas publicadas</Typography>
            <Typography variant="h4">{stats?.basicStats.total_assignments}</Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* Completion rate by course */}
      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>Porcentaje de entregas por curso</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byCourse}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="course_name" hide={false} interval={0} angle={-20} textAnchor="end" height={80} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completion_rate" fill="#1976d2" name="% Entregas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>Cursos con mejor desempeño</Typography>
            {stats?.topCourses.map(course => (
              <div key={course.course_id}>
                <Typography variant="body1">{course.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Promedio: {parseFloat(course.average_grade).toFixed(2)}
                </Typography>
              </div>
            ))}
          </CardContent>
        </Card>
      </Grid>

      {/* Completion rate by student */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>% de entregas por alumno</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byStudent.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="student_name" hide={false} interval={0} angle={-20} textAnchor="end" height={80} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completion_rate" fill="#43a047" name="% Entregas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Completion rate by teacher */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>% de entregas por docente</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byTeacher}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="teacher_name" hide={false} interval={0} angle={-20} textAnchor="end" height={80} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completion_rate" fill="#ef6c00" name="% Entregas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

export default CoordinatorDashboard;
