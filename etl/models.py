from sqlalchemy import Column, Integer, String, Date, Numeric, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
try:
    from etl.db import Base
except (ImportError, ModuleNotFoundError):
    from db import Base

class EmpresaFavorita(Base):
    __tablename__ = 'empresas_favoritas'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(20), unique=True, nullable=False, index=True)
    nombre_empresa = Column(String(100), nullable=False)
    sector = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Relaciones
    datos_raw = relationship("DatosFinancierosRaw", back_populates="empresa", cascade="all, delete-orphan")
    kpis = relationship("KpisAnaliticos", back_populates="empresa", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<EmpresaFavorita(ticker='{self.ticker}', name='{self.nombre_empresa}')>"

class DatosFinancierosRaw(Base):
    __tablename__ = 'datos_financieros_raw'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(20), ForeignKey('empresas_favoritas.ticker', onupdate='CASCADE', ondelete='CASCADE'), nullable=False)
    fecha_reporte = Column(Date, nullable=False)
    periodo = Column(String(10), nullable=False, default='FY') # 'FY' para anual, 'Q1'-'Q4' para trimestral
    total_revenue = Column(Numeric(20, 2), nullable=True)
    net_income = Column(Numeric(20, 2), nullable=True)
    total_assets = Column(Numeric(20, 2), nullable=True)
    total_liabilities = Column(Numeric(20, 2), nullable=True)
    total_equity = Column(Numeric(20, 2), nullable=True)
    diluted_average_shares = Column(Numeric(20, 2), nullable=True)
    operating_income = Column(Numeric(20, 2), nullable=True)
    ebitda = Column(Numeric(20, 2), nullable=True)
    current_assets = Column(Numeric(20, 2), nullable=True)
    current_liabilities = Column(Numeric(20, 2), nullable=True)
    
    # Restricción de unicidad combinada de 3 columnas para asegurar idempotencia
    __table_args__ = (
        UniqueConstraint('ticker', 'fecha_reporte', 'periodo', name='uq_raw_ticker_fecha_periodo'),
    )
    
    # Relación
    empresa = relationship("EmpresaFavorita", back_populates="datos_raw")

    def __repr__(self):
        return f"<DatosFinancierosRaw(ticker='{self.ticker}', date='{self.fecha_reporte}')>"

class KpisAnaliticos(Base):
    __tablename__ = 'kpis_analiticos'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(20), ForeignKey('empresas_favoritas.ticker', onupdate='CASCADE', ondelete='CASCADE'), nullable=False)
    fecha_reporte = Column(Date, nullable=False)
    periodo = Column(String(10), nullable=False, default='FY')
    margen_neto = Column(Numeric(10, 4), nullable=True)
    roe = Column(Numeric(10, 4), nullable=True)
    roa = Column(Numeric(10, 4), nullable=True)
    debt_to_equity = Column(Numeric(10, 4), nullable=True)
    eps = Column(Numeric(10, 4), nullable=True)
    current_ratio = Column(Numeric(10, 4), nullable=True)
    margen_operativo = Column(Numeric(10, 4), nullable=True)
    margen_ebitda = Column(Numeric(10, 4), nullable=True)
    
    # Restricción de unicidad combinada de 3 columnas para asegurar idempotencia
    __table_args__ = (
        UniqueConstraint('ticker', 'fecha_reporte', 'periodo', name='uq_kpi_ticker_fecha_periodo'),
    )
    
    # Relación
    empresa = relationship("EmpresaFavorita", back_populates="kpis")

    def __repr__(self):
        return f"<KpisAnaliticos(ticker='{self.ticker}', date='{self.fecha_reporte}')>"
