import React, { useState, useEffect } from 'react';
import { 
  Grid, 
  Card, 
  CardContent, 
  Typography, 
  CircularProgress, 
  Alert, 
  Chip, 
  Box 
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
// Removed RouterLink; navigation to course happens only from Courses page per requirements
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const TeacherDashboard = () => {
  const [teacherCourses, setTeacherCourses] = useState([]);
  const [studentCourses, setStudentCourses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const [cacheMode, setCacheMode] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch courses por rol
        // Intento 1: cursos reales (rol teacher)
        let tCourses = [];
        try {
          const teacherRes = await api.get('/classroom/courses?role=teacher');
          tCourses = teacherRes.data.data || [];
          setCacheMode(false);
        } catch (innerErr) {
          // Fallback: cache local para no romper el dashboard
          const cacheRes = await api.get('/classroom/cache/courses');
          tCourses = cacheRes.data.data || [];
          setCacheMode(true);
        }

        // Only fetch student courses for non-teacher roles
        let sCourses = [];
        if (user?.role !== 'teacher') {
          const studentRes = await api.get('/classroom/courses?role=student');
          sCourses = studentRes.data.data || [];
        }
        setTeacherCourses(tCourses);
        setStudentCourses(sCourses);

        setStats({
          totalCourses: tCourses.length + (user?.role !== 'teacher' ? sCourses.length : 0),
          teacherCount: tCourses.length,
          studentCount: user?.role !== 'teacher' ? sCourses.length : 0,
        });

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

  // Small, uniform card for a course tile
  const CourseTile = ({ course }) => (
    <Card
      component={RouterLink}
      to={`/courses/${course.id}`}
      sx={{ height: 130, display: 'flex', textDecoration: 'none', cursor: 'pointer', '&:hover': { boxShadow: 4 } }}
    >
      <CardContent sx={{ my: 'auto' }}>
        <Typography variant="subtitle1" fontWeight={600} noWrap>
          {course.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {course.section || 'No section'}
        </Typography>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      {/* Header row: only the Teacher Courses chip (the global Welcome lives in DashboardPage) */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
        <Chip label="Teacher Courses" color="default" variant="outlined" />
      </Box>

      <Grid container spacing={3}>
        {cacheMode && (
          <Grid item xs={12}>
            <Alert severity="info">Mostrando datos en modo caché (temporal). Intenta recargar o volver a iniciar sesión para datos en vivo.</Alert>
          </Grid>
        )}

     

        {/* Teacher courses grid: xs=12, md=6, lg=3 */}
        {teacherCourses.map((course) => (
          <Grid key={course.id} item xs={12} md={6} lg={3}>
            <CourseTile course={course} />
          </Grid>
        ))}

        {/* Student courses only for non-teacher roles */}
        {user?.role !== 'teacher' && studentCourses.map((course) => (
          <Grid key={course.id} item xs={12} md={6} lg={3}>
            <CourseTile course={course} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default TeacherDashboard;
