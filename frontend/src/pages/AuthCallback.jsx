import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');

    if (token) {
      login(token);
    } else {
      // Handle error case
      navigate('/login?error=auth_failed');
    }
  }, [location, login, navigate]);

  return <div>Loading...</div>; // Or a spinner component
};

export default AuthCallback;
