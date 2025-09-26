import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Paper, CircularProgress, Alert, Box } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import api from '../services/api';

const columns = [
  { 
    field: 'name',
    headerName: 'Student Name',
    width: 250,
    valueGetter: (params) => params.row.profile.name.fullName 
  },
  // Email column removed per user request
  { 
    field: 'totalAssignments',
    headerName: 'Total Assignments',
    type: 'number',
    width: 150,
    valueGetter: (params) => params.row.progress.totalAssignments
  },
  { 
    field: 'submittedCount',
    headerName: 'Submitted',
    type: 'number',
    width: 120,
    valueGetter: (params) => params.row.progress.submittedCount
  },
  { 
    field: 'missingCount',
    headerName: 'Missing',
    type: 'number',
    width: 120,
    valueGetter: (params) => params.row.progress.missingCount
  },
  {
    field: 'completion',
    headerName: 'Completion (%)',
    type: 'number',
    width: 150,
    valueGetter: (params) => {
      const total = params.row?.progress?.totalAssignments ?? 0;
      const submitted = params.row?.progress?.submittedCount ?? 0;
      if (!total) return null;
      return Math.round((submitted / total) * 10000) / 100; // two decimals
    },
    renderCell: (params) => {
      const val = params.value;
      if (val === null || val === undefined) {
        return <Typography color="text.secondary">—</Typography>;
      }
      const fmt = Number(val).toFixed(2);
      return (
        <Typography color={Number(val) < 60 ? 'error' : 'inherit'}>
          {fmt}
        </Typography>
      );
    },
    sortComparator: (v1, v2) => (v1 ?? -1) - (v2 ?? -1),
  },
];

const CourseProgressPage = () => {
  const { courseId } = useParams();
  const [progressData, setProgressData] = useState([]);
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch course details and progress data in parallel
        const [courseRes, progressRes] = await Promise.all([
          api.get(`/classroom/courses/${courseId}`),
          api.get(`/classroom/courses/${courseId}/progress`)
        ]);
        setCourse(courseRes.data.data);
        setProgressData(progressRes.data.data);
        setError(null);
      } catch (err) {
        setError('Failed to fetch course progress data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [courseId]);

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Container maxWidth="xl">
      <Typography variant="h4" gutterBottom>
        Student Progress: {course?.name}
      </Typography>
      <Paper style={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={progressData}
          columns={columns}
          getRowId={(row) => row.userId}
          pageSize={10}
          rowsPerPageOptions={[10, 25, 50]}
          disableSelectionOnClick
        />
      </Paper>
    </Container>
  );
};

export default CourseProgressPage;
