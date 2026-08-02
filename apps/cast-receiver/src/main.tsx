import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function ReceiverShell(){return <main><div className="mark">WB</div><p>WATCH BRACKET</p><h1>Ready for Cast setup</h1><small>Milestone 2 will add secure launch-token exchange and the Google Cast receiver lifecycle.</small></main>}
createRoot(document.getElementById('root')!).render(<StrictMode><ReceiverShell/></StrictMode>);

