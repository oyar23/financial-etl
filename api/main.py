import sys
import os
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException
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

    class Config:
        from_attributes = True  # Reemplaza a orm_mode=True en Pydantic v2

class KpiSchema(BaseModel):
    id: int
    ticker: str
    fecha_reporte: date
    margen_neto: Optional[float]
    roe: Optional[float]
    roa: Optional[float]
    debt_to_equity: Optional[float]

    class Config:
        from_attributes = True

class FinancialsSchema(BaseModel):
    id: int
    ticker: str
    fecha_reporte: date
    total_revenue: Optional[float]
    net_income: Optional[float]
    total_assets: Optional[float]
    total_liabilities: Optional[float]
    total_equity: Optional[float]

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

@app.get("/kpis/{ticker}", response_model=List[KpiSchema], tags=["KPIs"])
def get_kpis_by_ticker(ticker: str, db: Session = Depends(get_db)):
    """
    Retorna el histórico de KPIs analíticos de una empresa específica, ordenados por fecha de reporte (de más reciente a más antiguo).
    """
    # Limpieza del ticker (convertir a mayúsculas)
    ticker_upper = ticker.strip().upper()
    
    # Verificar si la empresa existe
    empresa = db.query(EmpresaFavorita).filter(EmpresaFavorita.ticker == ticker_upper).first()
    if not empresa:
        raise HTTPException(status_code=404, detail=f"Empresa con ticker '{ticker_upper}' no encontrada.")
        
    try:
        kpis = db.query(KpisAnaliticos)\
                 .filter(KpisAnaliticos.ticker == ticker_upper)\
                 .order_by(KpisAnaliticos.fecha_reporte.desc())\
                 .all()
        return kpis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener KPIs para {ticker_upper}: {str(e)}")

@app.get("/financials/{ticker}", response_model=List[FinancialsSchema], tags=["Datos Financieros Crudos"])
def get_financials_by_ticker(ticker: str, db: Session = Depends(get_db)):
    """
    Retorna el histórico de datos financieros crudos (ingresos, beneficios, activos, etc.) de una empresa específica,
    ordenados por fecha de reporte (de más antiguo a más reciente, ideal para gráficos).
    """
    ticker_upper = ticker.strip().upper()
    
    # Verificar si la empresa existe
    empresa = db.query(EmpresaFavorita).filter(EmpresaFavorita.ticker == ticker_upper).first()
    if not empresa:
        raise HTTPException(status_code=404, detail=f"Empresa con ticker '{ticker_upper}' no encontrada.")
        
    try:
        financials = db.query(DatosFinancierosRaw)\
                       .filter(DatosFinancierosRaw.ticker == ticker_upper)\
                       .order_by(DatosFinancierosRaw.fecha_reporte.asc())\
                       .all()
        return financials
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener datos financieros para {ticker_upper}: {str(e)}")
