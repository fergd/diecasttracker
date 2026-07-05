import { HashRouter, Routes, Route } from 'react-router-dom';
import { InventoryProvider } from './api/InventoryContext';
import { CollectionList } from './pages/CollectionList';
import { ItemDetail } from './pages/ItemDetail';

function App() {
  return (
    <InventoryProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<CollectionList />} />
          <Route path="/item/:id" element={<ItemDetail />} />
        </Routes>
      </HashRouter>
    </InventoryProvider>
  );
}

export default App;
