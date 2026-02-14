import React, { useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Checkbox,
    FormControlLabel,
    Link,
    Alert,
    Divider,
    IconButton,
    InputAdornment,
    useTheme
} from '@mui/material';
import {
    Visibility,
    VisibilityOff,
    GitHub,
    Google,
    Microsoft,
    LockOutlined
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { useNotification } from '../hooks/useNotification';
import { useNavigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
    const theme = useTheme();
    const navigate = useNavigate();
    const { login } = useAuth();
    const { showNotification } = useNotification();

    const [formData, setFormData] = useState({
        username: '',
        password: '',
        rememberMe: false
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const success = await login(formData.username, formData.password, formData.rememberMe);
            
            if (success) {
                showNotification('Login successful!', 'success');
                navigate('/dashboard');
            } else {
                setError('Invalid username or password');
            }
        } catch (error) {
            setError('An error occurred during login');
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = (provider: string) => {
        showNotification(`Login with ${provider}`, 'info');
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f5f5f5',
                backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                p: 2
            }}
        >
            <Paper
                elevation={6}
                sx={{
                    display: 'flex',
                    maxWidth: 1000,
                    width: '100%',
                    overflow: 'hidden',
                    borderRadius: 2
                }}
            >
                {/* Left Side - Branding */}
                <Box
                    sx={{
                        flex: 1,
                        bgcolor: 'primary.main',
                        color: 'white',
                        p: 4,
                        display: { xs: 'none', md: 'flex' },
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        textAlign: 'center'
                    }}
                >
                    <LockOutlined sx={{ fontSize: 80, mb: 2 }} />
                    <Typography variant="h3" component="h1" fontWeight="600" gutterBottom>
                        NOVA
                    </Typography>
                    <Typography variant="h5" gutterBottom>
                        Development Studio
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 2, opacity: 0.9 }}>
                        Build enterprise applications faster with the complete AL-like framework
                    </Typography>
                    <Box sx={{ mt: 4 }}>
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                            © 2024 NOVA Framework. All rights reserved.
                        </Typography>
                    </Box>
                </Box>

                {/* Right Side - Login Form */}
                <Box
                    sx={{
                        flex: 1,
                        p: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                    }}
                >
                    <Box sx={{ mb: 3, textAlign: 'center' }}>
                        <Typography variant="h5" component="h2" fontWeight="600" gutterBottom>
                            Welcome Back
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Sign in to continue to NOVA Studio
                        </Typography>
                    </Box>

                    {error && (
                        <Alert severity="error" sx={{ mb: 3 }}>
                            {error}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="Username or Email"
                            variant="outlined"
                            margin="normal"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            required
                            autoFocus
                        />

                        <TextField
                            fullWidth
                            label="Password"
                            type={showPassword ? 'text' : 'password'}
                            variant="outlined"
                            margin="normal"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={() => setShowPassword(!showPassword)}
                                            edge="end"
                                        >
                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={formData.rememberMe}
                                        onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                                        color="primary"
                                    />
                                }
                                label="Remember me"
                            />
                            <Link href="#" variant="body2" underline="hover">
                                Forgot password?
                            </Link>
                        </Box>

                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            size="large"
                            disabled={loading}
                            sx={{ mt: 3, mb: 2, py: 1.5 }}
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>

                    <Box sx={{ my: 2, display: 'flex', alignItems: 'center' }}>
                        <Divider sx={{ flex: 1 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>
                            OR
                        </Typography>
                        <Divider sx={{ flex: 1 }} />
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<Microsoft />}
                            onClick={() => handleSocialLogin('Microsoft')}
                            sx={{ py: 1.5 }}
                        >
                            Microsoft
                        </Button>
                        <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<Google />}
                            onClick={() => handleSocialLogin('Google')}
                            sx={{ py: 1.5 }}
                        >
                            Google
                        </Button>
                    </Box>

                    <Box sx={{ mt: 3, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            Don't have an account?{' '}
                            <Link href="#" underline="hover" fontWeight="600">
                                Contact your administrator
                            </Link>
                        </Typography>
                    </Box>
                </Box>
            </Paper>
        </Box>
    );
};