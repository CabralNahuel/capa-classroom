import React from 'react';
import { NavLink } from 'react-router-dom';
import { Drawer, List, Divider, IconButton, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { ChevronLeft as ChevronLeftIcon, Dashboard as DashboardIcon, School as SchoolIcon, People as PeopleIcon, BarChart as BarChartIcon, AdminPanelSettings as AdminPanelSettingsIcon } from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';

const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
  justifyContent: 'flex-end',
}));

const navItems = [
  { text: 'Tablero', icon: <DashboardIcon />, path: '/dashboard', roles: ['student', 'teacher', 'coordinator'] },
  // Menú de cursos removido: la navegación se hace desde las tarjetas del dashboard
  { text: 'Estudiantes', icon: <PeopleIcon />, path: '/students', roles: ['teacher', 'coordinator'] },
  { text: 'Docentes', icon: <PeopleIcon />, path: '/teachers', roles: ['coordinator'] },
  { text: 'Reportes', icon: <BarChartIcon />, path: '/reports', roles: ['coordinator'] },
  { text: 'Panel de Coordinación', icon: <AdminPanelSettingsIcon />, path: '/coordinator', roles: ['coordinator'] },
];

export default function Sidebar({ open, handleDrawerClose, drawerWidth }) {
  const { user } = useAuth();

  return (
    <Drawer
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
        },
      }}
      variant="persistent"
      anchor="left"
      open={open}
    >
      <DrawerHeader>
        <IconButton onClick={handleDrawerClose}>
          <ChevronLeftIcon />
        </IconButton>
      </DrawerHeader>
      <Divider />
      <List>
        {navItems.map((item) => (
          user && item.roles.includes(user.role) && (
            <ListItem key={item.text} disablePadding component={NavLink} to={item.path} style={{ textDecoration: 'none', color: 'inherit' }}>
              <ListItemButton>
                <ListItemIcon>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          )
        ))}
      </List>
    </Drawer>
  );
}
