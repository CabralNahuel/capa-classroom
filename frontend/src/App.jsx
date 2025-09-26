import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './context/AuthContext';

// Import pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CoursePage from './pages/CoursePage';
import CoursesPage from './pages/CoursesPage';
import StudentPage from './pages/StudentPage';
import StudentsPage from './pages/StudentsPage';
import TeacherPage from './pages/TeacherPage';
import CoordinatorPage from './pages/CoordinatorPage';
import ReportsPage from './pages/ReportsPage';
import CourseProgressPage from './pages/CourseProgressPage';
import AssignmentProgressPage from './pages/AssignmentProgressPage';
import AuthCallback from './pages/AuthCallback';

// Import components
import PrivateRoute from './components/common/PrivateRoute';
import Layout from './components/layout/Layout';

// Define a custom theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f4f6f8',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 500,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#333',
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            
            {/* Private Routes with Layout */}
            <Route 
              path="/" 
              element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="teacher" element={<TeacherPage />} />
              <Route path="courses" element={<CoursesPage />} />
              <Route path="courses/:courseId" element={<CoursePage />} />
              <Route path="courses/:courseId/progress" element={<CourseProgressPage />} />
              <Route path="courses/:courseId/assignments/:assignmentId/progress" element={<AssignmentProgressPage />} />
              <Route path="students/:studentId" element={<StudentPage />} />
              <Route path="teachers/:teacherId" element={<TeacherPage />} />
              <Route path="coordinator" element={<CoordinatorPage />} />
              <Route path="reports" element={<ReportsPage />} />
              {/* Add more routes as needed */}
            </Route>

            {/* Add a 404 Not Found route if needed */}
            <Route path="*" element={<div>Page Not Found</div>} />
          </Routes>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
