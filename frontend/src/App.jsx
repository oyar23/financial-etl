import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { 
  Star, TrendingUp, Percent, Activity, DollarSign, Calendar, AlertTriangle, Plus, X, RefreshCw, Trash2, Download
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

// Lista de KPIs disponibles para interactuar y graficar
const ALL_KPI_METRICS = [
  { key: 'Margen Neto (%)', label: 'Margen Neto', color: 'var(--color-primary)', yAxisId: 'left' },
  { key: 'Margen Operativo (%)', label: 'Margen Operativo', color: 'var(--color-success)', yAxisId: 'left' },
  { key: 'Margen EBITDA (%)', label: 'Margen EBITDA', color: 'var(--color-secondary)', yAxisId: 'left' },
  { key: 'ROE (%)', label: 'ROE', color: '#e879f9', yAxisId: 'left' },
  { key: 'ROA (%)', label: 'ROA', color: '#22d3ee', yAxisId: 'left' },
  { key: 'Apalancamiento (x)', label: 'Apalancamiento (D/E)', color: '#f87171', yAxisId: 'right' },
  { key: 'Liquidez (x)', label: 'Liquidez Corriente', color: '#fbbf24', yAxisId: 'right' },
  { key: 'EPS ($)', label: 'EPS', color: '#a78bfa', yAxisId: 'right' }
];

export default function App() {
  const [companies, setCompanies] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [competitorTicker, setCompetitorTicker] = useState('');
  
  const [financials, setFinancials] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [competitorFinancials, setCompetitorFinancials] = useState([]);
  const [competitorKpis, setCompetitorKpis] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Toggles de periodo y rango de fechas
  const [timeframe, setTimeframe] = useState('Anual'); // 'Anual' o 'Trimestral'
  const [timeRangeActive, setTimeRangeActive] = useState('MAX'); // '1A', '3A', '5A', 'MAX'
  
  // KPIs que el usuario desea ver en el gráfico de líneas
  const [visibleKpis, setVisibleKpis] = useState([
    'Margen Neto (%)', 
    'Margen Operativo (%)', 
    'Margen EBITDA (%)'
  ]);
  
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

  // Cargar lista inicial de empresas favoritas
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
            const stillExists = selectedTicker && data.find(c => c.ticker === selectedTicker);
            if (stillExists) {
              setSelectedTicker(selectedTicker);
            } else {
              const hasAmazon = data.find(c => c.ticker === 'AMZN');
              setSelectedTicker(hasAmazon ? 'AMZN' : data[0].ticker);
            }
          }
        } else {
          setSelectedTicker('');
          setFinancials([]);
          setKpis([]);
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

  // Cargar datos financieros y KPIs del principal y competidor
  const loadData = () => {
    if (!selectedTicker) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const periodQuery = timeframe === 'Anual' ? 'FY' : 'Q';
    const fetches = [
      fetch(`${API_BASE_URL}/financials/${selectedTicker}?periodo=${periodQuery}`).then(res => res.json()),
      fetch(`${API_BASE_URL}/kpis/${selectedTicker}?periodo=${periodQuery}`).then(res => res.json())
    ];

    if (competitorTicker) {
      fetches.push(fetch(`${API_BASE_URL}/financials/${competitorTicker}?periodo=${periodQuery}`).then(res => res.json()));
      fetches.push(fetch(`${API_BASE_URL}/kpis/${competitorTicker}?periodo=${periodQuery}`).then(res => res.json()));
    }

    Promise.all(fetches)
      .then(results => {
        const [financialsData, kpisData, compFinancialsData, compKpisData] = results;
        
        if (financialsData.detail || kpisData.detail) {
          throw new Error(financialsData.detail || kpisData.detail);
        }
        
        setFinancials(financialsData);
        setKpis(kpisData);
        
        if (competitorTicker && compFinancialsData && compKpisData) {
          if (compFinancialsData.detail || compKpisData.detail) {
            console.warn("Error cargando competidor: ", compFinancialsData.detail || compKpisData.detail);
            setCompetitorFinancials([]);
            setCompetitorKpis([]);
          } else {
            setCompetitorFinancials(compFinancialsData);
            setCompetitorKpis(compKpisData);
          }
        } else {
          setCompetitorFinancials([]);
          setCompetitorKpis([]);
        }
        
        // Obtener la unión de todos los años disponibles
        const allData = [...financialsData, ...kpisData];
        if (competitorTicker && compFinancialsData && compKpisData) {
          allData.push(...compFinancialsData, ...compKpisData);
        }
        
        const years = Array.from(new Set(
          allData.map(item => item.fecha_reporte.split('-')[0])
        )).sort();
        
        if (years.length > 0) {
          setAvailableYears(years);
          if (!years.includes(startYear)) setStartYear(years[0]);
          if (!years.includes(endYear)) setEndYear(years[years.length - 1]);
        }
        
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(`Error al obtener los datos de la API: ${err.message}`);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [selectedTicker, timeframe, competitorTicker]);

  // Manejar cambio de empresa principal
  const handleCompanyChange = (e) => {
    setSelectedTicker(e.target.value);
    // Si la empresa principal coincide con el competidor, limpiar competidor
    if (e.target.value === competitorTicker) {
      setCompetitorTicker('');
    }
    setIsFavorite(false);
  };

  // Manejar píldoras de filtros rápidos de tiempo (1A, 3A, 5A, MAX)
  const handleTimeRangeSelect = (range) => {
    setTimeRangeActive(range);
    if (availableYears.length === 0) return;
    const latestYear = parseInt(availableYears[availableYears.length - 1]);
    
    if (range === '1A') {
      setStartYear(latestYear.toString());
      setEndYear(latestYear.toString());
    } else if (range === '3A') {
      const start = Math.max(parseInt(availableYears[0]), latestYear - 2);
      setStartYear(start.toString());
      setEndYear(latestYear.toString());
    } else if (range === '5A') {
      const start = Math.max(parseInt(availableYears[0]), latestYear - 4);
      setStartYear(start.toString());
      setEndYear(latestYear.toString());
    } else if (range === 'MAX') {
      setStartYear(availableYears[0]);
      setEndYear(availableYears[availableYears.length - 1]);
    }
  };

  // Ejecución manual del ETL
  const triggerETL = () => {
    setRefreshingETL(true);
    fetch(`${API_BASE_URL}/etl/run`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        alert("El pipeline ETL de Docker se ha iniciado en segundo plano. Los datos se actualizarán en un momento.");
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

  // Manejar eliminación de empresa
  const handleDeleteCompany = () => {
    if (!selectedTicker) return;
    const confirmDelete = window.confirm(`¿Estás seguro de que deseas eliminar la empresa ${selectedTicker} y todos sus registros históricos en cascada?`);
    if (!confirmDelete) return;

    fetch(`${API_BASE_URL}/empresas/${selectedTicker}`, {
      method: 'DELETE'
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error al eliminar la empresa');
        return data;
      })
      .then(() => {
        alert(`Empresa ${selectedTicker} eliminada exitosamente.`);
        loadCompanies();
      })
      .catch(err => {
        console.error(err);
        alert(`No se pudo eliminar la empresa: ${err.message}`);
      });
  };

  // Manejar envío de nueva empresa
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
        fetch(`${API_BASE_URL}/etl/run`, { method: 'POST' })
          .then(() => {
            setTimeout(() => {
              setNewTicker('');
              setNewName('');
              setNewSector('');
              setSubmitting(false);
              setShowAddModal(false);
              setModalSuccess(null);
              loadCompanies(company.ticker);
            }, 3000);
          })
          .catch(() => {
            setSubmitting(false);
            setModalError('Se creó la empresa pero no se pudo ejecutar el pipeline ETL automáticamente.');
          });
      })
      .catch(err => {
        console.error(err);
        setModalError(err.message);
        setSubmitting(false);
      });
  };

  // Exportar a CSV para Excel
  const exportToCsv = () => {
    const headers = ['Fecha Reporte', 'Periodo', 'Ingresos', 'Beneficio Neto', 'Margen Operativo', 'Margen EBITDA', 'Margen Neto', 'EPS', 'Current Ratio', 'Apalancamiento'];
    const rows = filteredKpis.map(kpi => {
      const raw = filteredFinancials.find(f => f.fecha_reporte === kpi.fecha_reporte && f.periodo === kpi.periodo) || {};
      return [
        kpi.fecha_reporte,
        kpi.periodo,
        raw.total_revenue || '',
        raw.net_income || '',
        kpi.margen_operativo || '',
        kpi.margen_ebitda || '',
        kpi.margen_neto || '',
        kpi.eps || '',
        kpi.current_ratio || '',
        kpi.debt_to_equity || ''
      ];
    });
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += headers.join(",") + "\n";
    rows.forEach(row => {
      csvContent += row.map(v => `"${v}"`).join(",") + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${selectedTicker}_data_${timeframe.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const filteredCompFinancials = filterByYearRange(competitorFinancials);
  const filteredCompKpis = filterByYearRange(competitorKpis);

  // Obtener información de empresa actual
  const currentCompany = companies.find(c => c.ticker === selectedTicker) || {
    ticker: selectedTicker || 'Ninguna',
    nombre_empresa: selectedTicker ? selectedTicker : 'No hay empresas registradas',
    sector: 'N/A'
  };

  // KPIs del último reporte
  const latestKpi = filteredKpis[0] || {};
  const mockPrice = MOCK_STOCK_PRICES[selectedTicker] || { price: '0.00', change: '+0.00', pct: '+0.00', status: 'positive' };

  // Calcular P/B Ratio usando Patrimonio y Acciones Diluidas
  const rawForLatest = filteredFinancials.find(f => f.fecha_reporte === latestKpi.fecha_reporte && f.periodo === latestKpi.periodo) || {};
  const bookValuePerShare = rawForLatest.total_equity && rawForLatest.diluted_average_shares && rawForLatest.diluted_average_shares > 0 
    ? rawForLatest.total_equity / rawForLatest.diluted_average_shares 
    : null;
  const pbRatioStr = bookValuePerShare && bookValuePerShare > 0 
    ? `${(mockPrice.price / bookValuePerShare).toFixed(2)}x` 
    : 'N/A';

  // Calcular Salud Financiera (Health Score)
  const calculateHealthScore = (kpi) => {
    if (!kpi || Object.keys(kpi).length === 0) return { score: 0, status: 'N/A', color: 'var(--text-muted)' };
    let score = 0;
    if (kpi.roa > 0.05) score += 2;
    else if (kpi.roa > 0) score += 1;
    
    if (kpi.current_ratio > 1.5) score += 2;
    else if (kpi.current_ratio > 1.0) score += 1;
    
    if (kpi.debt_to_equity < 1.0) score += 2;
    else if (kpi.debt_to_equity < 2.0) score += 1;
    
    if (kpi.margen_neto > 0.10) score += 2;
    else if (kpi.margen_neto > 0) score += 1;
    
    if (kpi.eps > 0) score += 2;
    
    let status = 'Riesgo Financiero';
    let color = 'var(--color-danger)';
    if (score >= 8) {
      status = 'Zona Segura (Fuerte)';
      color = 'var(--color-success)';
    } else if (score >= 5) {
      status = 'Zona de Prudencia';
      color = 'var(--color-secondary)';
    }
    return { score, status, color };
  };

  const health = calculateHealthScore(latestKpi);

  // Formateadores didácticos
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return 'N/A';
    const billions = value / 1_000_000_000;
    return `$${billions.toFixed(2)}B`;
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

  // Mapear datos cronológicos del principal
  const mappedPrimaryKpis = [...filteredKpis].reverse().map(item => ({
    ...item,
    periodoLabel: item.periodo === 'FY' ? item.fecha_reporte.split('-')[0] : `${item.fecha_reporte.split('-')[0]} ${item.periodo}`,
    'Margen Neto (%)': item.margen_neto ? Math.round(item.margen_neto * 10000) / 100 : 0,
    'Margen Operativo (%)': item.margen_operativo ? Math.round(item.margen_operativo * 10000) / 100 : 0,
    'Margen EBITDA (%)': item.margen_ebitda ? Math.round(item.margen_ebitda * 10000) / 100 : 0,
    'ROE (%)': item.roe ? Math.round(item.roe * 10000) / 100 : 0,
    'ROA (%)': item.roa ? Math.round(item.roa * 10000) / 100 : 0,
    'Apalancamiento (x)': item.debt_to_equity ? Math.round(item.debt_to_equity * 100) / 100 : 0,
    'Liquidez (x)': item.current_ratio ? Math.round(item.current_ratio * 100) / 100 : 0,
    'EPS ($)': item.eps ? Math.round(item.eps * 100) / 100 : 0,
  }));

  // Mapear datos del competidor si está seleccionado
  const mappedCompetitorKpis = [...filteredCompKpis].reverse().map(item => ({
    ...item,
    periodoLabel: item.periodo === 'FY' ? item.fecha_reporte.split('-')[0] : `${item.fecha_reporte.split('-')[0]} ${item.periodo}`,
    'Margen Neto (%)': item.margen_neto ? Math.round(item.margen_neto * 10000) / 100 : 0,
    'Margen Operativo (%)': item.margen_operativo ? Math.round(item.margen_operativo * 10000) / 100 : 0,
    'Margen EBITDA (%)': item.margen_ebitda ? Math.round(item.margen_ebitda * 10000) / 100 : 0,
    'ROE (%)': item.roe ? Math.round(item.roe * 10000) / 100 : 0,
    'ROA (%)': item.roa ? Math.round(item.roa * 10000) / 100 : 0,
    'Apalancamiento (x)': item.debt_to_equity ? Math.round(item.debt_to_equity * 100) / 100 : 0,
    'Liquidez (x)': item.current_ratio ? Math.round(item.current_ratio * 100) / 100 : 0,
    'EPS ($)': item.eps ? Math.round(item.eps * 100) / 100 : 0,
  }));

  // Combinar datos primarios y competidor para el LineChart (Benchmarking)
  const combinedKpisData = mappedPrimaryKpis.map(primaryItem => {
    const competitorItem = mappedCompetitorKpis.find(c => c.periodoLabel === primaryItem.periodoLabel);
    const combined = { ...primaryItem };
    
    // Inyectar datos crudos para el Tooltip enriquecido
    const primaryRaw = filteredFinancials.find(f => f.fecha_reporte === primaryItem.fecha_reporte && f.periodo === primaryItem.periodo) || {};
    combined.raw_net_income = primaryRaw.net_income;
    combined.raw_total_revenue = primaryRaw.total_revenue;
    combined.raw_operating_income = primaryRaw.operating_income;
    combined.raw_ebitda = primaryRaw.ebitda;

    ALL_KPI_METRICS.forEach(metric => {
      // Clave unívoca primaria
      combined[`${selectedTicker} - ${metric.key}`] = primaryItem[metric.key];
      if (competitorItem) {
        combined[`${competitorTicker} - ${metric.key}`] = competitorItem[metric.key];
      }
    });
    
    return combined;
  });

  const cronologicalFinancialsData = [...filteredFinancials].map(item => ({
    ...item,
    periodoLabel: item.periodo === 'FY' ? item.fecha_reporte.split('-')[0] : `${item.fecha_reporte.split('-')[0]} ${item.periodo}`,
    'Ingresos (MM)': item.total_revenue ? item.total_revenue / 1_000_000_000 : 0,
    'Beneficios (MM)': item.net_income ? item.net_income / 1_000_000_000 : 0,
  }));

  // Componente de Tooltip Enriquecido
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip glass fade-in">
          <p className="tooltip-label">{label}</p>
          <div className="tooltip-items">
            {payload.map((item, idx) => {
              const rawObj = item.payload;
              const isPercent = item.name.includes('%') || item.dataKey.includes('%');
              const isRatio = item.name.includes('(x)') || item.dataKey.includes('(x)');
              const isEps = item.name.includes('$') || item.dataKey.includes('$');
              
              let valueStr = '';
              if (isPercent) valueStr = `${item.value.toFixed(2)}%`;
              else if (isEps) valueStr = `$${item.value.toFixed(2)}`;
              else valueStr = item.value.toFixed(2);
              
              // Desglose de fórmula en vivo usando datos raw
              let breakdownStr = '';
              if (!competitorTicker) {
                if (item.dataKey.includes('Margen Neto') && rawObj.raw_net_income && rawObj.raw_total_revenue) {
                  breakdownStr = ` (Net: ${formatCurrency(rawObj.raw_net_income)} / Rev: ${formatCurrency(rawObj.raw_total_revenue)})`;
                } else if (item.dataKey.includes('Margen Operativo') && rawObj.raw_operating_income && rawObj.raw_total_revenue) {
                  breakdownStr = ` (Op: ${formatCurrency(rawObj.raw_operating_income)} / Rev: ${formatCurrency(rawObj.raw_total_revenue)})`;
                } else if (item.dataKey.includes('Margen EBITDA') && rawObj.raw_ebitda && rawObj.raw_total_revenue) {
                  breakdownStr = ` (EBITDA: ${formatCurrency(rawObj.raw_ebitda)} / Rev: ${formatCurrency(rawObj.raw_total_revenue)})`;
                }
              }
              
              return (
                <div key={idx} className="tooltip-item" style={{ color: item.color }}>
                  <span className="tooltip-item-name">{item.name}:</span>
                  <span className="tooltip-item-value">{valueStr}{breakdownStr}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

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
            {/* Selector de Empresa Principal */}
            <div className="control-wrapper">
              <span className="control-label">Empresa Principal</span>
              <select 
                className="select-input" 
                value={selectedTicker} 
                onChange={handleCompanyChange}
                disabled={companies.length === 0}
              >
                {companies.length === 0 ? (
                  <option value="">(Sin empresas)</option>
                ) : (
                  companies.map(c => (
                    <option key={c.id} value={c.ticker}>
                      {c.ticker} - {c.nombre_empresa}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Selector de Competidor (Benchmarking) */}
            <div className="control-wrapper">
              <span className="control-label">Comparar con</span>
              <select 
                className="select-input" 
                value={competitorTicker} 
                onChange={(e) => setCompetitorTicker(e.target.value)}
                disabled={companies.length <= 1}
              >
                <option value="">(Ninguno)</option>
                {companies.filter(c => c.ticker !== selectedTicker).map(c => (
                  <option key={c.id} value={c.ticker}>
                    {c.ticker} - {c.nombre_empresa}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtros de Rango de Años */}
            <div className="control-wrapper" style={{ minWidth: '220px' }}>
              <span className="control-label">Rango de Años</span>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <select 
                  className="select-input" 
                  value={startYear} 
                  onChange={(e) => { setStartYear(e.target.value); setTimeRangeActive(''); }}
                  disabled={companies.length === 0}
                  style={{ width: '80px' }}
                >
                  {availableYears.map(year => (
                    <option key={year} value={year} disabled={year > endYear}>
                      {year}
                    </option>
                  ))}
                </select>
                <span style={{ color: 'var(--text-muted)' }}>a</span>
                <select 
                  className="select-input" 
                  value={endYear} 
                  onChange={(e) => { setEndYear(e.target.value); setTimeRangeActive(''); }}
                  disabled={companies.length === 0}
                  style={{ width: '80px' }}
                >
                  {availableYears.map(year => (
                    <option key={year} value={year} disabled={year < startYear}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="control-wrapper" style={{ justifyContent: 'flex-end', height: '48px', paddingTop: '16px' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
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
                  <RefreshCw size={16} className={refreshingETL ? 'spin' : ''} /> Correr ETL
                </button>
                <button 
                  className="toggle-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                  onClick={handleDeleteCompany}
                  disabled={!selectedTicker}
                  title="Eliminar esta empresa de la base de datos"
                >
                  <Trash2 size={16} /> Eliminar
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

        {companies.length === 0 ? (
          <div className="empty-state-screen glass fade-in">
            <AlertTriangle size={48} className="kpi-icon" style={{ color: 'var(--color-secondary)' }} />
            <h2>No hay empresas registradas</h2>
            <p>Comienza agregando tu primera empresa de Yahoo Finance haciendo clic en el botón superior.</p>
            <button 
              className="toggle-btn active" 
              style={{ padding: '0.75rem 1.5rem', marginTop: '1rem', fontSize: '1rem', backgroundColor: 'var(--color-primary-glow)' }}
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={18} /> Agregar Empresa Favorita
            </button>
          </div>
        ) : loading ? (
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
                
                {/* Granularidad y Ejes temporales integrados */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div className="chart-toggles glass" style={{ padding: '0.25rem' }}>
                    <button 
                      className={`toggle-btn ${timeRangeActive === '1A' ? 'active' : ''}`}
                      onClick={() => handleTimeRangeSelect('1A')}
                    >
                      1A
                    </button>
                    <button 
                      className={`toggle-btn ${timeRangeActive === '3A' ? 'active' : ''}`}
                      onClick={() => handleTimeRangeSelect('3A')}
                    >
                      3A
                    </button>
                    <button 
                      className={`toggle-btn ${timeRangeActive === '5A' ? 'active' : ''}`}
                      onClick={() => handleTimeRangeSelect('5A')}
                    >
                      5A
                    </button>
                    <button 
                      className={`toggle-btn ${timeRangeActive === 'MAX' ? 'active' : ''}`}
                      onClick={() => handleTimeRangeSelect('MAX')}
                    >
                      MAX
                    </button>
                  </div>

                  <div className="chart-toggles glass" style={{ padding: '0.25rem' }}>
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

            {/* Grid de KPIs principales de Rendimiento */}
            <section className="kpi-grid fade-in">
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Margen Neto</span>
                  <Percent className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatPercent(latestKpi.margen_neto)}</span>
                <span className="kpi-card-desc">Conversión de ingresos a beneficio neto ({latestKpi.periodo} {latestKpi.fecha_reporte?.split('-')[0] || ''})</span>
              </div>

              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Margen Operativo</span>
                  <Activity className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatPercent(latestKpi.margen_operativo)}</span>
                <span className="kpi-card-desc">Margen de ganancias antes de impuestos y finanzas</span>
              </div>

              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Liquidez Corriente</span>
                  <TrendingUp className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatRatio(latestKpi.current_ratio)}</span>
                <span className="kpi-card-desc">Ratio Activo Corriente / Pasivo Corriente (ideal &gt; 1.0)</span>
              </div>

              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Beneficio por Acción (EPS)</span>
                  <DollarSign className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{formatEps(latestKpi.eps)}</span>
                <span className="kpi-card-desc">Ganancia neta diluida por cada acción en circulación</span>
              </div>
            </section>

            {/* Grid de KPIs de Valoración de Mercado y Solvencia */}
            <section className="kpi-grid fade-in" style={{ marginTop: '1.5rem' }}>
              {/* P/E Ratio */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">P/E Ratio (Precio/Ganancia)</span>
                  <TrendingUp className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">
                  {latestKpi.eps && latestKpi.eps > 0 ? `${(mockPrice.price / latestKpi.eps).toFixed(2)}x` : 'N/A'}
                </span>
                <span className="kpi-card-desc">Relación precio acción / beneficio neto. Precio: ${mockPrice.price}</span>
              </div>

              {/* P/B Ratio */}
              <div className="kpi-card glass">
                <div className="kpi-card-header">
                  <span className="kpi-card-title">P/B Ratio (Precio/Libro)</span>
                  <Activity className="kpi-icon" size={20} />
                </div>
                <span className="kpi-card-value">{pbRatioStr}</span>
                <span className="kpi-card-desc">Relación precio acción / valor en libros de la empresa</span>
              </div>

              {/* Solvencia (Health Score) */}
              <div className="kpi-card glass" style={{ borderLeft: `4px solid ${health.color}` }}>
                <div className="kpi-card-header">
                  <span className="kpi-card-title">Puntaje de Solvencia (Health Score)</span>
                  <AlertTriangle className="kpi-icon" size={20} style={{ color: health.color }} />
                </div>
                <span className="kpi-card-value" style={{ color: health.color }}>{health.score}/10</span>
                <span className="kpi-card-desc" style={{ fontWeight: '600', color: health.color }}>
                  {health.status}
                </span>
              </div>
            </section>

            {/* Grid de Gráficos */}
            <section className="charts-grid fade-in" style={{ marginTop: '1.5rem' }}>
              
              {/* Gráfico 1: Análisis Interactivo de KPIs (Ejes Y Múltiples) */}
              <div className="chart-card glass">
                <div className="chart-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div className="chart-title-area">
                    <h3 className="chart-title">Análisis de KPIs Interactivo</h3>
                    <span className="chart-subtitle">
                      {competitorTicker 
                        ? `Comparando ${selectedTicker} (Línea Continua) vs ${competitorTicker} (Línea Discontinua)` 
                        : 'Selecciona los indicadores que deseas comparar y visualizar:'}
                    </span>
                  </div>
                  
                  {/* Selector de Chips de KPIs */}
                  <div className="kpi-selectors-container">
                    {ALL_KPI_METRICS.map(metric => {
                      const isSelected = visibleKpis.includes(metric.key);
                      return (
                        <button
                          key={metric.key}
                          className={`kpi-chip ${isSelected ? 'active' : ''}`}
                          style={{ 
                            borderColor: isSelected ? metric.color : 'var(--border-color)',
                            backgroundColor: isSelected ? `${metric.color}18` : 'transparent',
                            color: isSelected ? '#fff' : 'var(--text-muted)'
                          }}
                          onClick={() => {
                            if (isSelected) {
                              if (visibleKpis.length > 1) {
                                setVisibleKpis(visibleKpis.filter(k => k !== metric.key));
                              }
                            } else {
                              setVisibleKpis([...visibleKpis, metric.key]);
                            }
                          }}
                        >
                          <span className="chip-dot" style={{ backgroundColor: metric.color }}></span>
                          {metric.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                <div className="chart-container-wrapper" style={{ marginTop: '0.5rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={combinedKpisData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#1e2638" strokeDasharray="3 3" />
                      <XAxis dataKey="periodoLabel" stroke="#8e9bb2" />
                      
                      {/* Eje Y Múltiple: Izquierdo para porcentajes, Derecho para absolutos y ratios */}
                      <YAxis yAxisId="left" stroke="#8e9bb2" unit="%" />
                      <YAxis yAxisId="right" orientation="right" stroke="#8e9bb2" />
                      
                      <Tooltip content={<CustomTooltip />} />
                      
                      {/* Renderizar dinámicamente las líneas de KPIs seleccionados */}
                      {ALL_KPI_METRICS.filter(metric => visibleKpis.includes(metric.key)).map(metric => {
                        const elements = [];
                        if (competitorTicker) {
                          // Línea de la empresa Principal (sólida)
                          elements.push(
                            <Line 
                              key={`${selectedTicker}-${metric.key}`}
                              yAxisId={metric.yAxisId}
                              type="monotone"
                              name={`${selectedTicker} ${metric.label}`}
                              dataKey={`${selectedTicker} - ${metric.key}`}
                              stroke={metric.color}
                              strokeWidth={3}
                              activeDot={{ r: 6 }}
                            />
                          );
                          // Línea de la empresa Competidora (discontinua)
                          elements.push(
                            <Line 
                              key={`${competitorTicker}-${metric.key}`}
                              yAxisId={metric.yAxisId}
                              type="monotone"
                              name={`${competitorTicker} ${metric.label}`}
                              dataKey={`${competitorTicker} - ${metric.key}`}
                              stroke={metric.color}
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              activeDot={{ r: 4 }}
                            />
                          );
                        } else {
                          // Línea individual estándar
                          elements.push(
                            <Line 
                              key={metric.key}
                              yAxisId={metric.yAxisId}
                              type="monotone"
                              name={metric.label}
                              dataKey={metric.key}
                              stroke={metric.color}
                              strokeWidth={3}
                              activeDot={{ r: 6 }}
                            />
                          );
                        }
                        return elements;
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico 2: Ingresos vs. Beneficios */}
              <div className="chart-card glass">
                <div className="chart-header">
                  <div className="chart-title-area">
                    <h3 className="chart-title">Ingresos vs. Beneficios</h3>
                    <span className="chart-subtitle">Comparativa entre facturación bruta y ganancia neta ({selectedTicker})</span>
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
            <section className="table-section glass fade-in" style={{ marginTop: '1.5rem' }}>
              <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 className="table-title">Histórico de Estados Financieros y KPIs ({timeframe})</h3>
                  <span className="stock-market">Datos extraídos en formato normalizado con alertas de salud</span>
                </div>
                <button 
                  className="toggle-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', borderColor: 'var(--color-primary)' }}
                  onClick={exportToCsv}
                  title="Descargar datos en formato CSV para Microsoft Excel"
                >
                  <Download size={14} /> Exportar Excel (.csv)
                </button>
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
                      
                      // Alertas visuales
                      const hasLiquidityAlert = kpi.current_ratio && kpi.current_ratio < 1.0;
                      const hasLeverageAlert = kpi.debt_to_equity && kpi.debt_to_equity > 2.0;
                      const hasLossAlert = kpi.margen_neto && kpi.margen_neto < 0;

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
                          <td className="table-number" style={{ color: hasLossAlert ? 'var(--color-danger)' : 'inherit' }}>
                            {formatCurrency(raw.net_income)} {hasLossAlert && <span className="alert-badge">Pérdidas</span>}
                          </td>
                          <td className="table-number">{formatPercent(kpi.margen_operativo)}</td>
                          <td className="table-number">{formatPercent(kpi.margen_ebitda)}</td>
                          <td className="table-number" style={{ fontWeight: '700', color: hasLossAlert ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                            {formatPercent(kpi.margen_neto)}
                          </td>
                          <td className="table-number" style={{ fontWeight: '600', color: 'var(--color-success)' }}>
                            {formatEps(kpi.eps)}
                          </td>
                          <td className="table-number" style={{ color: hasLiquidityAlert ? 'var(--color-danger)' : 'inherit', fontWeight: hasLiquidityAlert ? '600' : 'normal' }}>
                            {formatRatio(kpi.current_ratio)} {hasLiquidityAlert && <span className="alert-badge">Riesgo Liquidez</span>}
                          </td>
                          <td className="table-number" style={{ color: hasLeverageAlert ? 'var(--color-danger)' : 'inherit', fontWeight: hasLeverageAlert ? '600' : 'normal' }}>
                            {formatRatio(kpi.debt_to_equity)} {hasLeverageAlert && <span className="alert-badge">Apalancado</span>}
                          </td>
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
