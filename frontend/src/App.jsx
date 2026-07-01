import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { 
  Star, TrendingUp, Percent, Activity, DollarSign, Calendar, AlertTriangle, Plus, X, RefreshCw
} from 'lucide-react';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

// Mock de cotizaciones para coincidir con la estética del diseño de referencia
const MOCK_STOCK_PRICES = {
  AAPL: { price: '189.84', change: '+2.43', pct: '+1.30', status: 'positive' },
  MSFT: { price: '421.90', change: '+5.12', pct: '+1.23', status: 'positive' },
  TSLA: { price: '177.46', change: '-3.82', pct: '-2.11', status: 'negative' },
  AMZN: { price: '185.50', change: '+4.20', pct: '+2.32', status: 'positive' },
  META: { price: '475.20', change: '+12.40', pct: '+2.68', status: 'positive' },
  GOOGL: { price: '173.50', change: '+1.80', pct: '+1.05', status: 'positive' }
};

export default function App() {
  const [companies, setCompanies] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState('AMZN');
  const [financials, setFinancials] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Toggles de periodo
  const [timeframe, setTimeframe] = useState('Anual'); // 'Anual' o 'Trimestral'
  
  // Filtros de fecha (Años)
  const [startYear, setStartYear] = useState('2022');
  const [endYear, setEndYear] = useState('2026');
  const [availableYears, setAvailableYears] = useState(['2022', '2023', '2024', '2025', '2026']);
  
  // Toggles estéticos
  const [isFavorite, setIsFavorite] = useState(false);

  // Modal para agregar nueva empresa
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newName, setNewName] = useState('');
  const [newSector, setNewSector] = useState('');
  const [modalError, setModalError] = useState(null);
  const [modalSuccess, setModalSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Estado de actualización manual del ETL
  const [refreshingETL, setRefreshingETL] = useState(false);

  // Cargar empresas favoritas iniciales
  const loadCompanies = (selectTickerAfterLoad = null) => {
    fetch(`${API_BASE_URL}/empresas`)
      .then(res => {
        if (!res.ok) throw new Error('Error al conectar con el servidor backend');
        return res.json();
      })
      .then(data => {
        setCompanies(data);
        if (data.length > 0) {
          if (selectTickerAfterLoad) {
            setSelectedTicker(selectTickerAfterLoad);
          } else {
            const hasAmazon = data.find(c => c.ticker === 'AMZN');
            setSelectedTicker(hasAmazon ? 'AMZN' : data[0].ticker);
          }
        }
      })
      .catch(err => {
        console.error(err);
        setError('No se pudo conectar con la API del Backend. Verifica que FastAPI está corriendo.');
      });
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  // Manejar cambio de empresa
  const handleCompanyChange = (e) => {
    setSelectedTicker(e.target.value);
    setIsFavorite(false);
  };

  // Cargar datos financieros y KPIs
  const loadData = () => {
    if (!selectedTicker) return;
    setLoading(true);
    setError(null);

    const periodQuery = timeframe === 'Anual' ? 'FY' : 'Q';

    Promise.all([
      fetch(`${API_BASE_URL}/financials/${selectedTicker}?periodo=${periodQuery}`).then(res => res.json()),
      fetch(`${API_BASE_URL}/kpis/${selectedTicker}?periodo=${periodQuery}`).then(res => res.json())
    ])
      .then(([financialsData, kpisData]) => {
        if (financialsData.detail || kpisData.detail) {
          throw new Error(financialsData.detail || kpisData.detail);
        }
        
        setFinancials(financialsData);
        setKpis(kpisData);
        
        // Obtener años únicos disponibles para los selectores
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
        setError(`Error al obtener los datos para ${selectedTicker}: ${err.message}`);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [selectedTicker, timeframe]);

  // Ejecución manual del ETL
  const triggerETL = () => {
    setRefreshingETL(true);
    fetch(`${API_BASE_URL}/etl/run`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        alert("El pipeline ETL de Docker se ha iniciado en segundo plano. Los datos se actualizarán en un momento.");
        // Esperamos 4 segundos y recargamos los datos
        setTimeout(() => {
          loadData();
          setRefreshingETL(false);
        }, 4000);
      })
      .catch(err => {
        console.error(err);
        alert("No se pudo iniciar el proceso ETL.");
        setRefreshingETL(false);
      });
  };

  // Manejar envío de nueva empresa (POST /empresas + POST /etl/run)
  const handleAddCompany = (e) => {
    e.preventDefault();
    setModalError(null);
    setModalSuccess(null);
    setSubmitting(true);

    if (!newTicker || !newName) {
      setModalError('El Ticker y el Nombre de la Empresa son obligatorios.');
      setSubmitting(false);
      return;
    }

    const payload = {
      ticker: newTicker.trim().toUpperCase(),
      nombre_empresa: newName.trim(),
      sector: newSector.trim() || null
    };

    // 1. Guardar la empresa en la BD
    fetch(`${API_BASE_URL}/empresas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error al guardar la empresa');
        return data;
      })
      .then(company => {
        setModalSuccess('Empresa guardada en base de datos. Descargando reportes trimestrales y anuales de Yahoo Finance...');
        
        // 2. Disparar el ETL en segundo plano para obtener sus datos de inmediato
        fetch(`${API_BASE_URL}/etl/run`, { method: 'POST' })
          .then(() => {
            setTimeout(() => {
              // Limpiar formulario y cerrar modal
              setNewTicker('');
              setNewName('');
              setNewSector('');
              setSubmitting(false);
              setShowAddModal(false);
              setModalSuccess(null);
              
              // Recargar selector de empresas y seleccionar la nueva empresa agregada
              loadCompanies(company.ticker);
            }, 3000);
          })
          .catch(() => {
            setSubmitting(false);
            setModalError('Se creó la empresa pero no se pudo ejecutar el pipeline ETL automáticamente. Intenta actualizar manualmente.');
          });
      })
      .catch(err => {
        console.error(err);
        setModalError(err.message);
        setSubmitting(false);
      });
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

  // Obtener la información de la empresa actual
  const currentCompany = companies.find(c => c.ticker === selectedTicker) || {
    ticker: selectedTicker,
    nombre_empresa: selectedTicker,
    sector: 'N/A'
  };

  // kpis está ordenado DESC, el índice 0 es el reporte más reciente
  const latestKpi = filteredKpis[0] || {};
  const mockPrice = MOCK_STOCK_PRICES[selectedTicker] || { price: '150.00', change: '+0.00', pct: '+0.00', status: 'positive' };

  // Formateadores didácticos
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return 'N/A';
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

  const formatEps = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return `$${value.toFixed(2)}`;
  };

  // Preparar etiquetas de eje X (año o año + Q) en orden cronológico ASC
  const cronologicalKpisData = [...filteredKpis].reverse().map(item => ({
    ...item,
    periodoLabel: item.periodo === 'FY' ? item.fecha_reporte.split('-')[0] : `${item.fecha_reporte.split('-')[0]} ${item.periodo}`,
    'Margen Neto (%)': item.margen_neto ? Math.round(item.margen_neto * 10000) / 100 : 0,
    'Margen Operativo (%)': item.margen_operativo ? Math.round(item.margen_operativo * 10000) / 100 : 0,
    'Margen EBITDA (%)': item.margen_ebitda ? Math.round(item.margen_ebitda * 10000) / 100 : 0,
  }));

  const cronologicalFinancialsData = [...filteredFinancials].map(item => ({
    ...item,
    periodoLabel: item.periodo === 'FY' ? item.fecha_reporte.split('-')[0] : `${item.fecha_reporte.split('-')[0]} ${item.periodo}`,
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
              <span className="control-label">Empresa Seleccionada</span>
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

            {/* Filtro Año Desde */}
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

            {/* Filtro Año Hasta */}
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

            {/* Botones de acción */}
            <div className="control-wrapper" style={{ justifyContent: 'flex-end', height: '48px', paddingTop: '16px' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="toggle-btn active"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: 'var(--color-primary-glow)', borderColor: 'var(--color-primary)' }}
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus size={16} /> Sumar Empresa
                </button>
                <button 
                  className="toggle-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  onClick={triggerETL}
                  disabled={refreshingETL}
                  title="Ejecutar ETL para descargar nuevos datos"
                >
                  <RefreshCw size={16} className={refreshingETL ? 'spin' : ''} /> {refreshingETL ? 'Corriendo...' : 'Correr ETL'}
                </button>
              </div>
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
              <strong>Error de API / Docker:</strong> {error}
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-screen fade-in">
            <div className="spinner"></div>
            <p>Conectando a PostgreSQL y cargando métricas financieras ({timeframe})...</p>
          </div>
        ) : (
          <>
            {/* Banner de Cotización */}
            <section className="stock-banner fade-in">
              <div className="stock-banner-info">
                <div className="stock-title-area">
                  <span className="stock-market">NASDAQGS - NASDAQ REAL TIME PRICE · USD</span>
                  <div className="stock-name-row">
                    <h2 className="stock-name">{currentCompany.nombre_empresa} ({currentCompany.ticker})</h2>
                    <button 
                      className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                      onClick={() => setIsFavorite(!isFavorite)}
                      title="Destacar empresa"
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
                  <span className="stock-time">A partir de las 14:13:44 GMT-4. Mercado abierto en tiempo real.</span>
                </div>
              </div>
            </section>

            {/* Grid de KPIs principales */}
            <section className="kpi-grid fade-in">
              {/* Margen Neto */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Margen Neto</span>
                  <Percent className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatPercent(latestKpi.margen_neto)}</span>
                <span className="kpi-card-desc">Conversión de ingresos a beneficio neto ({latestKpi.periodo} {latestKpi.fecha_reporte?.split('-')[0] || ''})</span>
              </div>

              {/* Margen Operativo */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Margen Operativo</span>
                  <Activity className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatPercent(latestKpi.margen_operativo)}</span>
                <span className="kpi-card-desc">Margen de ganancias antes de impuestos y finanzas</span>
              </div>

              {/* Current Ratio */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Liquidez Corriente</span>
                  <TrendingUp className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatRatio(latestKpi.current_ratio)}</span>
                <span className="kpi-card-desc">Ratio Activo Corriente / Pasivo Corriente (ideal &gt; 1.0)</span>
              </div>

              {/* Beneficios Por Acción (EPS) */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Beneficio por Acción (EPS)</span>
                  <DollarSign className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatEps(latestKpi.eps)}</span>
                <span className="kpi-card-desc">Ganancia neta diluida por cada acción en circulación</span>
              </div>
            </section>

            {/* Grid de Gráficos (Estilo Referencia) */}
            <section className="charts-grid fade-in">
              
              {/* Gráfico 1: Rentabilidad y Márgenes (EBITDA, Operativo y Neto) */}
              <div className="chart-card glass">
                <div className="chart-header">
                  <div className="chart-title-area">
                    <h3 className="chart-title">Márgenes de Rentabilidad (KPIs)</h3>
                    <span className="chart-subtitle">Histórico comparativo de Márgenes Neto, Operativo y EBITDA</span>
                  </div>
                </div>
                
                <div className="chart-container-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={cronologicalKpisData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#1e2638" strokeDasharray="3 3" />
                      <XAxis dataKey="periodoLabel" stroke="#8e9bb2" />
                      <YAxis stroke="#8e9bb2" unit="%" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111520', borderColor: '#21293a', color: '#f3f4f6' }}
                        labelStyle={{ fontWeight: 'bold' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="Margen EBITDA (%)" stroke="var(--color-secondary)" strokeWidth={3} />
                      <Line type="monotone" dataKey="Margen Operativo (%)" stroke="var(--color-success)" strokeWidth={3} />
                      <Line type="monotone" dataKey="Margen Neto (%)" stroke="var(--color-primary)" strokeWidth={3} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico 2: Ingresos vs. Beneficios (Estilo Referencia) */}
              <div className="chart-card glass">
                <div className="chart-header">
                  <div className="chart-title-area">
                    <h3 className="chart-title">Ingresos vs. Beneficios</h3>
                    <span className="chart-subtitle">Comparativa entre facturación bruta y ganancia neta</span>
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
                      <XAxis dataKey="periodoLabel" stroke="#8e9bb2" />
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

            {/* Tabla de registros históricos completos */}
            <section className="table-section glass fade-in">
              <div className="table-header">
                <h3 className="table-title">Histórico de Estados Financieros y KPIs ({timeframe})</h3>
                <span className="stock-market">Datos extraídos en formato normalizado</span>
              </div>
              
              <div className="table-wrapper">
                <table className="kpi-table">
                  <thead>
                    <tr>
                      <th>Fecha Reporte</th>
                      <th>Periodo</th>
                      <th>Ingresos</th>
                      <th>Beneficio Neto</th>
                      <th>Margen Operativo</th>
                      <th>Margen EBITDA</th>
                      <th>Margen Neto</th>
                      <th>EPS</th>
                      <th>Current Ratio</th>
                      <th>Apalancamiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKpis.map((kpi) => {
                      const raw = filteredFinancials.find(f => f.fecha_reporte === kpi.fecha_reporte && f.periodo === kpi.periodo) || {};
                      return (
                        <tr key={kpi.id}>
                          <td className="table-date">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Calendar size={14} className="kpi-icon" />
                              {kpi.fecha_reporte}
                            </div>
                          </td>
                          <td style={{ fontWeight: 'bold', color: kpi.periodo === 'FY' ? '#fff' : 'var(--color-secondary)' }}>
                            {kpi.periodo}
                          </td>
                          <td className="table-number">{formatCurrency(raw.total_revenue)}</td>
                          <td className="table-number">{formatCurrency(raw.net_income)}</td>
                          <td className="table-number">{formatPercent(kpi.margen_operativo)}</td>
                          <td className="table-number">{formatPercent(kpi.margen_ebitda)}</td>
                          <td className="table-number" style={{ fontWeight: '700', color: 'var(--color-primary)' }}>
                            {formatPercent(kpi.margen_neto)}
                          </td>
                          <td className="table-number" style={{ fontWeight: '600', color: 'var(--color-success)' }}>
                            {formatEps(kpi.eps)}
                          </td>
                          <td className="table-number">{formatRatio(kpi.current_ratio)}</td>
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

      {/* Modal: Sumar nueva empresa (POST /empresas) */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-container glass fade-in">
            <div className="modal-header">
              <h3>Agregar Nueva Empresa Favorita</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddCompany} className="modal-form">
              {modalError && (
                <div className="modal-alert error">
                  <AlertTriangle size={18} />
                  <span>{modalError}</span>
                </div>
              )}

              {modalSuccess && (
                <div className="modal-alert success">
                  <RefreshCw size={18} className="spin" />
                  <span>{modalSuccess}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Ticker (Yahoo Finance)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="ej. META, GOOGL, NFLX" 
                  value={newTicker} 
                  onChange={(e) => setNewTicker(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nombre de la Empresa</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="ej. Meta Platforms, Inc." 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Sector Industrial</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="ej. Tecnología / Social Media" 
                  value={newSector} 
                  onChange={(e) => setNewSector(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="toggle-btn" 
                  onClick={() => setShowAddModal(false)}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="toggle-btn active"
                  disabled={submitting}
                >
                  {submitting ? 'Guardando...' : 'Agregar Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
