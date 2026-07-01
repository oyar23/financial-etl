import sys
import os
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date

# Agregar el directorio raíz al path para poder importar la base de datos y modelos
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from etl.db import get_db
    from etl.models import EmpresaFavorita, KpisAnaliticos, DatosFinancierosRaw
except ModuleNotFoundError:
    # Intento alternativo en caso de problemas de path
    from db import get_db
    from models import EmpresaFavorita, KpisAnaliticos, DatosFinancierosRaw

app = FastAPI(
    title="Financial ETL API",
    description="API REST para consultar empresas favoritas y sus KPIs financieros analíticos.",
    version="1.0.0"
)

# Configuración de CORS para permitir solicitudes del Frontend (React / Vite)
# Permitimos todos los orígenes en desarrollo por simplicidad, pero se puede acotar
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas de Pydantic ---

class EmpresaSchema(BaseModel):
    id: int
    ticker: str
    nombre_empresa: str
    sector: Optional[str]
    is_active: bool
    precio_actual: Optional[float]
    cambio_diario: Optional[float]
    cambio_porcentaje: Optional[float]

    class Config:
        from_attributes = True  # Reemplaza a orm_mode=True en Pydantic v2

class EmpresaCreate(BaseModel):
    ticker: str
    nombre_empresa: str
    sector: Optional[str] = None

class KpiSchema(BaseModel):
    id: int
    ticker: str
    fecha_reporte: date
    periodo: str
    margen_neto: Optional[float]
    roe: Optional[float]
    roa: Optional[float]
    debt_to_equity: Optional[float]
    eps: Optional[float]
    current_ratio: Optional[float]
    margen_operativo: Optional[float]
    margen_ebitda: Optional[float]
    precio_accion: Optional[float]
    pe_ratio: Optional[float]

    class Config:
        from_attributes = True

class FinancialsSchema(BaseModel):
    id: int
    ticker: str
    fecha_reporte: date
    periodo: str
    total_revenue: Optional[float]
    net_income: Optional[float]
    total_assets: Optional[float]
    total_liabilities: Optional[float]
    total_equity: Optional[float]
    diluted_average_shares: Optional[float]
    operating_income: Optional[float]
    ebitda: Optional[float]
    current_assets: Optional[float]
    current_liabilities: Optional[float]
    precio_accion: Optional[float]

    class Config:
        from_attributes = True

# --- Endpoints ---

@app.get("/", tags=["General"])
def read_root():
    return {"message": "Bienvenido a la API REST del Pipeline Financiero. Accede a /docs para la documentación interactiva de Swagger."}

@app.get("/empresas", response_model=List[EmpresaSchema], tags=["Empresas"])
def get_empresas(db: Session = Depends(get_db)):
    """
    Retorna la lista de todas las empresas favoritas registradas en la base de datos.
    """
    try:
        empresas = db.query(EmpresaFavorita).order_by(EmpresaFavorita.ticker.asc()).all()
        return empresas
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener empresas: {str(e)}")

@app.post("/empresas", response_model=EmpresaSchema, status_code=201, tags=["Empresas"])
def create_empresa(empresa: EmpresaCreate, db: Session = Depends(get_db)):
    """
    Registra una nueva empresa favorita en la base de datos (Opción C de producción).
    """
    ticker_upper = empresa.ticker.strip().upper()
    existing = db.query(EmpresaFavorita).filter(EmpresaFavorita.ticker == ticker_upper).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"La empresa con ticker '{ticker_upper}' ya está registrada.")
    
    nueva = EmpresaFavorita(
        ticker=ticker_upper,
        nombre_empresa=empresa.nombre_empresa.strip(),
        sector=empresa.sector.strip() if empresa.sector else None,
        is_active=True
    )
    try:
        db.add(nueva)
        db.commit()
        db.refresh(nueva)
        return nueva
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar la empresa: {str(e)}")

@app.get("/kpis/{ticker}", response_model=List[KpiSchema], tags=["KPIs"])
def get_kpis_by_ticker(ticker: str, periodo: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Retorna el histórico de KPIs analíticos de una empresa específica, ordenados por fecha de reporte.
    Se puede filtrar por periodo: 'FY' (anual), 'Q' (todos los trimestrales) o un trimestre específico ('Q1', 'Q2', etc.).
    """
    ticker_upper = ticker.strip().upper()
    
    # Verificar si la empresa existe
    empresa = db.query(EmpresaFavorita).filter(EmpresaFavorita.ticker == ticker_upper).first()
    if not empresa:
        raise HTTPException(status_code=404, detail=f"Empresa con ticker '{ticker_upper}' no encontrada.")
        
    try:
        query = db.query(KpisAnaliticos).filter(KpisAnaliticos.ticker == ticker_upper)
        
        # Filtro de periodo
        if periodo:
            periodo_upper = periodo.strip().upper()
            if periodo_upper == 'FY':
                query = query.filter(KpisAnaliticos.periodo == 'FY')
            elif periodo_upper == 'Q':
                query = query.filter(KpisAnaliticos.periodo != 'FY')
            else:
                query = query.filter(KpisAnaliticos.periodo == periodo_upper)
                
        kpis = query.order_by(KpisAnaliticos.fecha_reporte.desc()).all()
        return kpis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener KPIs para {ticker_upper}: {str(e)}")

@app.get("/financials/{ticker}", response_model=List[FinancialsSchema], tags=["Datos Financieros Crudos"])
def get_financials_by_ticker(ticker: str, periodo: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Retorna el histórico de datos financieros crudos de una empresa específica.
    Se puede filtrar por periodo: 'FY' (anual), 'Q' (todos los trimestrales) o un trimestre específico ('Q1', 'Q2', etc.).
    """
    ticker_upper = ticker.strip().upper()
    
    # Verificar si la empresa existe
    empresa = db.query(EmpresaFavorita).filter(EmpresaFavorita.ticker == ticker_upper).first()
    if not empresa:
        raise HTTPException(status_code=404, detail=f"Empresa con ticker '{ticker_upper}' no encontrada.")
        
    try:
        query = db.query(DatosFinancierosRaw).filter(DatosFinancierosRaw.ticker == ticker_upper)
        
        # Filtro de periodo
        if periodo:
            periodo_upper = periodo.strip().upper()
            if periodo_upper == 'FY':
                query = query.filter(DatosFinancierosRaw.periodo == 'FY')
            elif periodo_upper == 'Q':
                query = query.filter(DatosFinancierosRaw.periodo != 'FY')
            else:
                query = query.filter(DatosFinancierosRaw.periodo == periodo_upper)
                
        financials = query.order_by(DatosFinancierosRaw.fecha_reporte.asc()).all()
        return financials
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener datos financieros para {ticker_upper}: {str(e)}")

@app.post("/etl/run", status_code=202, tags=["ETL"])
def run_etl_endpoint(background_tasks: BackgroundTasks):
    """
    Desencadena el proceso ETL en segundo plano para obtener la última información disponible.
    """
    try:
        from etl.etl import run_etl
        background_tasks.add_task(run_etl)
        return {"message": "Proceso ETL iniciado en segundo plano. Los datos se actualizarán en breve."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo iniciar el proceso ETL: {str(e)}")

@app.delete("/empresas/{ticker}", tags=["Empresas"])
def delete_empresa(ticker: str, db: Session = Depends(get_db)):
    """
    Elimina una empresa favorita y todos sus datos relacionados (RAW y KPIs) en cascada.
    """
    ticker_upper = ticker.strip().upper()
    empresa = db.query(EmpresaFavorita).filter(EmpresaFavorita.ticker == ticker_upper).first()
    if not empresa:
        raise HTTPException(status_code=404, detail=f"Empresa con ticker '{ticker_upper}' no encontrada.")
    try:
        db.delete(empresa)
        db.commit()
        return {"message": f"Empresa {ticker_upper} eliminada exitosamente."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar la empresa: {str(e)}")
