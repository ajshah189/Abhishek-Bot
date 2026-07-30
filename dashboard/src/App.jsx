import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Expenses from './pages/Expenses';
import Habits from './pages/Habits';
import Memory from './pages/Memory';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/memory" element={<Memory />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
