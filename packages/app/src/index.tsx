import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@backstage/ui/css/styles.css';
// After Backstage UI's stylesheet: Inter, then the SpechtLabs tokens over BUI's.
import '@fontsource-variable/inter';
import './modules/theme/spechtlabs.css';

ReactDOM.createRoot(document.getElementById('root')!).render(App.createRoot());
