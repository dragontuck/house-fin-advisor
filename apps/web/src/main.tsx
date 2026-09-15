import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './auth/AuthContext'
import { OnboardingProvider } from './context/OnboardingContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider>
            <OnboardingProvider>
                <App />
            </OnboardingProvider>
        </AuthProvider>
    </React.StrictMode>,
)
