import React, { useEffect, useState } from 'react';
import { Container, Typography, Card, CardContent, CircularProgress, Alert, Box } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import api from '../services/api';

const ReportsPage = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.get('/reports/course-completion');
        const rows = (res.data?.data || []).map(r => ({
          courseId: r.courseId,
          courseName: r.courseName,
          completionRate: r.completionRate,
          completedStudents: r.completedStudents,
          consideredStudents: r.consideredStudents,
        }));
        setData(rows);
        setError(null);
      } catch (err) {
        console.error(err);
        setError('No se pudieron cargar las estadísticas');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>Reports</Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Alumnos que completan el curso</Typography>
          {data.length === 0 ? (
            <Typography color="text.secondary">No hay datos para mostrar.</Typography>
          ) : (
            <Box sx={{ width: '100%', height: 420 }}>
              <ResponsiveContainer>
                <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="courseName" angle={-20} textAnchor="end" interval={0} height={60} />
                  <YAxis unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(v, n, p) => [`${v}%`, 'Completion']} labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload;
                    return `${item?.courseName} — ${item?.completedStudents}/${item?.consideredStudents}`;
                  }} />
                  <Bar dataKey="completionRate" fill="#1976d2" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="completionRate" position="top" formatter={(v) => `${v}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </CardContent>
      </Card>
    </Container>
  );
};

export default ReportsPage;
