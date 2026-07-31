import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Expenses from './pages/Expenses';
import Habits from './pages/Habits';
import Memory from './pages/Memory';
import Voice from './pages/Voice';
import Admin from './pages/Admin';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Voice gets its own full-screen layout — no sidebar */}
        <Route path="/voice" element={<Voice />} />

        {/* Everything else uses the dashboard Layout */}
        <Route
          path="*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/habits" element={<Habits />} />
                <Route path="/memory" element={<Memory />} />
                <Route path="/admin" element={<Admin />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
