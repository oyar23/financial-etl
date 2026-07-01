import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { 
  Star, TrendingUp, Percent, Activity, DollarSign, Calendar, AlertTriangle
} from 'lucide-react';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

// Mock de cotizaciones para coincidir con la estética del diseño de referencia
const MOCK_STOCK_PRICES = {
  AAPL: { price: '189.84', change: '+2.43', pct: '+1.30', status: 'positive' },
  MSFT: { price: '421.90', change: '+5.12', pct: '+1.23', status: 'positive' },
  TSLA: { price: '177.46', change: '-3.82', pct: '-2.11', status: 'negative' },
  AMZN: { price: '185.50', change: '+4.20', pct: '+2.32', status: 'positive' }
};

export default function App() {
  const [companies, setCompanies] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState('AMZN');
  const [financials, setFinancials] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filtros de fecha
  const [startYear, setStartYear] = useState('2022');
  const [endYear, setEndYear] = useState('2025');
  const [availableYears, setAvailableYears] = useState(['2021', '2022', '2023', '2024', '2025']);
  
  // Toggles estéticos
  const [isFavorite, setIsFavorite] = useState(false);
  const [timeframe, setTimeframe] = useState('Anual');

  // Cargar empresas favoritas iniciales
  useEffect(() => {
    fetch(`${API_BASE_URL}/empresas`)
      .then(res => {
        if (!res.ok) throw new Error('Error al conectar con el servidor backend');
        return res.json();
      })
      .then(data => {
        setCompanies(data);
        if (data.length > 0) {
          // Buscamos si Amazon está en la lista para que sea la seleccionada por defecto
          const hasAmazon = data.find(c => c.ticker === 'AMZN');
          setSelectedTicker(hasAmazon ? 'AMZN' : data[0].ticker);
        }
      })
      .catch(err => {
        console.error(err);
        setError('No se pudo establecer la conexión con la API del Backend. Asegúrate de que FastAPI está corriendo.');
        setLoading(false);
      });
  }, []);

  // Cargar datos financieros y KPIs del ticker seleccionado
  useEffect(() => {
    if (!selectedTicker) return;
    setLoading(true);
    setError(null);

    // Cargar en paralelo ambos conjuntos de datos
    Promise.all([
      fetch(`${API_BASE_URL}/financials/${selectedTicker}`).then(res => res.json()),
      fetch(`${API_BASE_URL}/kpis/${selectedTicker}`).then(res => res.json())
    ])
      .then(([financialsData, kpisData]) => {
        if (financialsData.detail || kpisData.detail) {
          throw new Error(financialsData.detail || kpisData.detail);
        }
        
        setFinancials(financialsData);
        setKpis(kpisData);
        
        // Obtener la lista única de años disponibles para los filtros a partir de los reportes
        const years = Array.from(new Set([
          ...financialsData.map(f => f.fecha_reporte.split('-')[0]),
          ...kpisData.map(k => k.fecha_reporte.split('-')[0])
        ])).sort();
        
        if (years.length > 0) {
          setAvailableYears(years);
          setStartYear(years[0]);
          setEndYear(years[years.length - 1]);
        }
        
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(`Error al obtener los datos para el ticker ${selectedTicker}: ${err.message}`);
        setLoading(false);
      });
  }, [selectedTicker]);

  // Manejar cambio de empresa
  const handleCompanyChange = (e) => {
    setSelectedTicker(e.target.value);
    setIsFavorite(false); // Reset star rating
  };

  // Filtrar datos según el rango de años seleccionado
  const filterByYearRange = (data) => {
    return data.filter(item => {
      const year = item.fecha_reporte.split('-')[0];
      return year >= startYear && year <= endYear;
    });
  };

  const filteredFinancials = filterByYearRange(financials);
  const filteredKpis = filterByYearRange(kpis);

  // Obtener la información del ticker seleccionado
  const currentCompany = companies.find(c => c.ticker === selectedTicker) || {
    ticker: selectedTicker,
    nombre_empresa: selectedTicker === 'AMZN' ? 'Amazon.com, Inc.' : selectedTicker,
    sector: 'Cargando sector...'
  };

  // Obtener los KPIs más recientes para las tarjetas informativas
  // kpis está ordenado por fecha DESC, por lo que el primer elemento es el más reciente
  const latestKpi = filteredKpis[0] || {};
  const mockPrice = MOCK_STOCK_PRICES[selectedTicker] || { price: '0.00', change: '+0.00', pct: '+0.00%', status: 'positive' };

  // Formateadores didácticos para los números
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return 'N/A';
    // Dividimos por mil millones para mostrar en formato "MM USD"
    const billions = value / 1_000_000_000;
    return `${billions.toFixed(2)} MM`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatRatio = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return value.toFixed(2);
  };

  // Preparar datos para el gráfico de KPIs (se necesita en orden cronológico ASC)
  const cronologicalKpisData = [...filteredKpis].reverse().map(item => ({
    ...item,
    año: item.fecha_reporte.split('-')[0],
    'Margen Neto (%)': item.margen_neto ? Math.round(item.margen_neto * 10000) / 100 : 0,
    'ROE (%)': item.roe ? Math.round(item.roe * 10000) / 100 : 0,
    'ROA (%)': item.roa ? Math.round(item.roa * 10000) / 100 : 0,
  }));

  // Preparar datos para el gráfico de Ingresos vs Beneficios (se necesita en orden cronológico ASC)
  const cronologicalFinancialsData = [...filteredFinancials].map(item => ({
    ...item,
    año: item.fecha_reporte.split('-')[0],
    'Ingresos (MM)': item.total_revenue ? item.total_revenue / 1_000_000_000 : 0,
    'Beneficios (MM)': item.net_income ? item.net_income / 1_000_000_000 : 0,
  }));

  return (
    <div className="app-wrapper">
      {/* Header */}
      <header className="app-header glass">
        <div className="header-content">
          <div className="brand-section">
            <div className="brand-logo">
              <TrendingUp size={28} />
            </div>
            <h1 className="brand-title">Finance Pipeline</h1>
          </div>

          <div className="controls-section">
            {/* Selector de Empresas */}
            <div className="control-wrapper">
              <span className="control-label">Empresa Favorita</span>
              <select 
                className="select-input" 
                value={selectedTicker} 
                onChange={handleCompanyChange}
              >
                {companies.map(c => (
                  <option key={c.id} value={c.ticker}>
                    {c.ticker} - {c.nombre_empresa}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro: Año Inicio */}
            <div className="control-wrapper">
              <span className="control-label">Año Desde</span>
              <select 
                className="select-input" 
                value={startYear} 
                onChange={(e) => setStartYear(e.target.value)}
              >
                {availableYears.map(year => (
                  <option key={year} value={year} disabled={year > endYear}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro: Año Fin */}
            <div className="control-wrapper">
              <span className="control-label">Año Hasta</span>
              <select 
                className="select-input" 
                value={endYear} 
                onChange={(e) => setEndYear(e.target.value)}
              >
                {availableYears.map(year => (
                  <option key={year} value={year} disabled={year < startYear}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {error && (
          <div className="error-message fade-in">
            <AlertTriangle size={24} />
            <div>
              <strong>Error en la API:</strong> {error}
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-screen fade-in">
            <div className="spinner"></div>
            <p>Conectando con la base de datos de Docker y cargando métricas...</p>
          </div>
        ) : (
          <>
            {/* Banner de Cotización (Réplica del Diseño de Referencia) */}
            <section className="stock-banner fade-in">
              <div className="stock-banner-info">
                <div className="stock-title-area">
                  <span className="stock-market">NASDAQGS - NASDAQ REAL TIME PRICE · USD</span>
                  <div className="stock-name-row">
                    <h2 className="stock-name">{currentCompany.nombre_empresa} ({currentCompany.ticker})</h2>
                    <button 
                      className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                      onClick={() => setIsFavorite(!isFavorite)}
                      title="Marcar como favorito"
                    >
                      <Star size={24} fill={isFavorite ? "var(--color-secondary)" : "none"} />
                    </button>
                  </div>
                  <span className="stock-market">Sector: {currentCompany.sector || 'N/A'}</span>
                </div>
                <div className="stock-price-area">
                  <div className="stock-price-row">
                    <span className="stock-price">${mockPrice.price}</span>
                    <span className={`stock-change ${mockPrice.status}`}>
                      {mockPrice.change} ({mockPrice.pct}%)
                    </span>
                  </div>
                  <span className="stock-time">A partir de las 14:13:44 GMT-4. Mercado abierto.</span>
                </div>
              </div>
            </section>

            {/* Tarjetas de Métricas Principales (KPIs) */}
            <section className="kpi-grid fade-in">
              {/* Margen Neto */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Margen Neto</span>
                  <Percent className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatPercent(latestKpi.margen_neto)}</span>
                <span className="kpi-card-desc">Margen de ganancia neta sobre ingresos totales ({latestKpi.fecha_reporte?.split('-')[0] || ''})</span>
              </div>

              {/* ROE */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">ROE</span>
                  <TrendingUp className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatPercent(latestKpi.roe)}</span>
                <span className="kpi-card-desc">Retorno sobre el patrimonio neto ({latestKpi.fecha_reporte?.split('-')[0] || ''})</span>
              </div>

              {/* ROA */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">ROA</span>
                  <Activity className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatPercent(latestKpi.roa)}</span>
                <span className="kpi-card-desc">Retorno sobre los activos totales ({latestKpi.fecha_reporte?.split('-')[0] || ''})</span>
              </div>

              {/* Debt to Equity */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Debt to Equity</span>
                  <DollarSign className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatRatio(latestKpi.debt_to_equity)}</span>
                <span className="kpi-card-desc">Relación de apalancamiento pasivo/patrimonio ({latestKpi.fecha_reporte?.split('-')[0] || ''})</span>
              </div>
            </section>

            {/* Panel de Gráficos (Diseño de Referencia con Recharts) */}
            <section className="charts-grid fade-in">
              
              {/* Gráfico 1: Tendencias de KPIs */}
              <div className="chart-card glass">
                <div className="chart-header">
                  <div className="chart-title-area">
                    <h3 className="chart-title">Beneficios y Rentabilidad (KPIs)</h3>
                    <span className="chart-subtitle">Línea de tendencia histórica de ratios porcentuales</span>
                  </div>
                  <div className="chart-toggles">
                    <button className="toggle-btn active">Porcentaje (%)</button>
                  </div>
                </div>
                
                <div className="chart-container-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={cronologicalKpisData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#1e2638" strokeDasharray="3 3" />
                      <XAxis dataKey="año" stroke="#8e9bb2" />
                      <YAxis stroke="#8e9bb2" unit="%" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111520', borderColor: '#21293a', color: '#f3f4f6' }}
                        labelStyle={{ fontWeight: 'bold' }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="Margen Neto (%)" 
                        stroke="var(--color-primary)" 
                        strokeWidth={3} 
                        activeDot={{ r: 8 }} 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="ROE (%)" 
                        stroke="var(--color-success)" 
                        strokeWidth={3} 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="ROA (%)" 
                        stroke="var(--color-secondary)" 
                        strokeWidth={3} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico 2: Ingresos vs. Beneficios (Estilo Referencia) */}
              <div className="chart-card glass">
                <div className="chart-header">
                  <div className="chart-title-area">
                    <h3 className="chart-title">Ingresos vs. Beneficios</h3>
                    <span className="chart-subtitle">Comparativa de ingresos brutos contra beneficio neto</span>
                  </div>
                  <div className="chart-toggles">
                    <button 
                      className={`toggle-btn ${timeframe === 'Anual' ? 'active' : ''}`}
                      onClick={() => setTimeframe('Anual')}
                    >
                      Anual
                    </button>
                    <button 
                      className={`toggle-btn ${timeframe === 'Trimestral' ? 'active' : ''}`}
                      onClick={() => setTimeframe('Trimestral')}
                      title="Datos trimestrales no cargados en el ETL"
                    >
                      Trimestral
                    </button>
                  </div>
                </div>
                
                <div className="chart-container-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={cronologicalFinancialsData}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#1e2638" strokeDasharray="3 3" />
                      <XAxis dataKey="año" stroke="#8e9bb2" />
                      <YAxis stroke="#8e9bb2" unit=" B" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111520', borderColor: '#21293a', color: '#f3f4f6' }}
                        formatter={(value) => [`$${value.toFixed(2)} Billones`, '']}
                      />
                      <Legend />
                      <Bar dataKey="Ingresos (MM)" name="Ingresos" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Beneficios (MM)" name="Beneficios" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Tabla Histórica de Datos */}
            <section className="table-section glass fade-in">
              <div className="table-header">
                <h3 className="table-title">Historial Financiero y KPIs</h3>
                <span className="stock-market">Datos ordenados por fecha de reporte</span>
              </div>
              
              <div className="table-wrapper">
                <table className="kpi-table">
                  <thead>
                    <tr>
                      <th>Fecha Reporte</th>
                      <th>Ingresos Totales</th>
                      <th>Ingreso Neto</th>
                      <th>Margen Neto</th>
                      <th>ROE</th>
                      <th>ROA</th>
                      <th>Debt to Equity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKpis.map((kpi, idx) => {
                      // Buscamos los datos raw de la misma fecha
                      const raw = filteredFinancials.find(f => f.fecha_reporte === kpi.fecha_reporte) || {};
                      return (
                        <tr key={kpi.id}>
                          <td className="table-date">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Calendar size={14} className="kpi-icon" />
                              {kpi.fecha_reporte}
                            </div>
                          </td>
                          <td className="table-number">{formatCurrency(raw.total_revenue)}</td>
                          <td className="table-number">{formatCurrency(raw.net_income)}</td>
                          <td className="table-number" style={{ fontWeight: '600', color: 'var(--color-primary)' }}>
                            {formatPercent(kpi.margen_neto)}
                          </td>
                          <td className="table-number">{formatPercent(kpi.roe)}</td>
                          <td className="table-number">{formatPercent(kpi.roa)}</td>
                          <td className="table-number">{formatRatio(kpi.debt_to_equity)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
