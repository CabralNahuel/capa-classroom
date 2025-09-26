import React, { useEffect, useState } from 'react';
import { Container, Typography, Grid, Card, CardContent, List, ListItemButton, ListItemText, CircularProgress, Alert, Divider, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const CoursesPage = () => {
  const [teacherCourses, setTeacherCourses] = useState([]);
  const [studentCourses, setStudentCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Always fetch teacher courses
        const tRes = await api.get('/classroom/courses?role=teacher');
        setTeacherCourses(tRes.data.data || []);

        // Only fetch student courses for non-teacher roles
        if (user?.role !== 'teacher') {
          const sRes = await api.get('/classroom/courses?role=student');
          setStudentCourses(sRes.data.data || []);
        } else {
          setStudentCourses([]);
        }
        setError(null);
      } catch (err) {
        console.error(err);
        setError('Failed to load courses');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.role]);

  if (loading) return <CircularProgress/>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>Courses</Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={user?.role === 'teacher' ? 12 : 6}>
          <Card>
            <CardContent>
              {teacherCourses.length === 0 && (
                <Typography color="text.secondary">No courses where you are teacher.</Typography>
              )}
              <List>
                {teacherCourses.map(c => (
                  <Box key={c.id}>
                    <ListItemButton component={RouterLink} to={`/courses/${c.id}`}>
                      <ListItemText primary={c.name} secondary={c.section || 'No section'} />
                    </ListItemButton>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, pb: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        component={RouterLink}
                        to={`/courses/${c.id}/progress`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Student Progress
                      </Button>
                    </Box>
                    <Divider />
                  </Box>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
        {user?.role !== 'teacher' && (
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>Student Courses</Typography>
              {studentCourses.length === 0 && (
                <Typography color="text.secondary">No courses where you are student.</Typography>
              )}
              <List>
                {studentCourses.map(c => (
                  <Box key={c.id}>
                    <ListItemButton component={RouterLink} to={`/courses/${c.id}`}>
                      <ListItemText primary={c.name} secondary={c.section || 'No section'} />
                    </ListItemButton>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, pb: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        component={RouterLink}
                        to={`/courses/${c.id}/progress`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Student Progress
                      </Button>
                    </Box>
                    <Divider />
                  </Box>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default CoursesPage;
