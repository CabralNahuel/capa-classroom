import React from 'react';
import { useAuth } from '../context/AuthContext';
import StudentDashboard from '../components/dashboards/StudentDashboard';
import TeacherDashboard from '../components/dashboards/TeacherDashboard';
import CoordinatorDashboard from '../components/dashboards/CoordinatorDashboard';
import { Container, Typography } from '@mui/material';

const DashboardPage = () => {
  const { user } = useAuth();

  const renderDashboard = () => {
    if (!user) return null;

    switch (user.role) {
      case 'student':
        return <StudentDashboard />;
      case 'teacher':
        return <TeacherDashboard />;
      case 'coordinator':
        return <CoordinatorDashboard />;
      default:
        return <Typography>Unknown user role.</Typography>;
    }
  };

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom sx={{ mb: 4 }}>
        Welcome, {user?.name}!
      </Typography>
      {renderDashboard()}
    </Container>
  );
};

export default DashboardPage;
