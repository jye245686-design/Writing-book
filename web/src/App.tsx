import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Home from './pages/Home'
import Create from './pages/Create'
import CreateTitle from './pages/CreateTitle'
import CreateOutline from './pages/CreateOutline'
import CreateCharacters from './pages/CreateCharacters'
import CreateWriting from './pages/CreateWriting'
import Login from './pages/Login'
import Register from './pages/Register'

function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="create" element={<RequireAuth><Create /></RequireAuth>} />
          <Route path="create/title" element={<RequireAuth><CreateTitle /></RequireAuth>} />
          <Route path="create/characters" element={<RequireAuth><CreateCharacters /></RequireAuth>} />
          <Route path="create/outline" element={<RequireAuth><CreateOutline /></RequireAuth>} />
          <Route path="create/outline/:projectId" element={<RequireAuth><CreateOutline /></RequireAuth>} />
          <Route path="create/writing/:projectId" element={<RequireAuth><CreateWriting /></RequireAuth>} />
          <Route path="create/writing" element={<RequireAuth><CreateWriting /></RequireAuth>} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  )
}

export default App
