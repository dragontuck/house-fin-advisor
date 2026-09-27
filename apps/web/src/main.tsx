import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { OnboardingProvider } from './context/OnboardingContext'
import App from './App'
import './index.css'
import { KeycloakCallback } from './pages/keycloakCallback';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/auth/callback" element={<KeycloakCallback />} />
                </Routes>
            </BrowserRouter>
            <OnboardingProvider>
                <App />
            </OnboardingProvider>
        </AuthProvider>
    </React.StrictMode>,
)
