import React, { useState, useEffect } from 'react';
import { Grid, Card, CardContent, Typography, CircularProgress, Alert } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../services/api';

const CoordinatorDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const statsRes = await api.get('/reports/dashboard/overview');
        setStats(statsRes.data.data);
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

      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>Actividad reciente</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats?.recentActivity.reverse()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="activity_count" fill="#8884d8" name="Actividades" />
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
    </Grid>
  );
};

export default CoordinatorDashboard;
