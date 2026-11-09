import { createRoot } from 'react-dom/client';
import { DataProvider } from './api';
import App from './App';
import { ToastProvider } from './components';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('未找到应用挂载节点');

createRoot(root).render(
  <DataProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </DataProvider>
);
