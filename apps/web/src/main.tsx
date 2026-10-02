import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { OnboardingProvider } from './context/OnboardingContext'
import App from './App'
import './index.css'
import { KeycloakCallback } from './pages/keycloakCallback';
import { ProtectedRoute } from './auth/protectedRoute';
import { LoginPage } from './pages/LoginPage';

console.log('[main.tsx] 🚀 Application initializing...');

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>

        <AuthProvider>
            <OnboardingProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/auth/callback" element={<KeycloakCallback />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="*" element={<ProtectedRoute><App /></ProtectedRoute>} />
                    </Routes>
                </BrowserRouter>
            </OnboardingProvider>
        </AuthProvider>
    </React.StrictMode>,
)
