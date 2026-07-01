import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import decimal
import datetime

# Intentar importar modelos locales
try:
    from etl.models import Base, EmpresaFavorita, DatosFinancierosRaw, KpisAnaliticos
except ImportError:
    from models import Base, EmpresaFavorita, DatosFinancierosRaw, KpisAnaliticos

# Configurar conexión a la base de datos
DATABASE_URL = "postgresql://postgres:postgres_password@localhost:5433/finance_db"
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()

# Clase para serializar decimales y fechas
class CustomEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        return super(CustomEncoder, self).default(obj)

def dump_data():
    print("Iniciando extracción de datos para demostración estática...")
    
    # 1. Obtener empresas
    empresas = session.query(EmpresaFavorita).all()
    empresas_list = []
    tickers = []
    for emp in empresas:
        tickers.append(emp.ticker)
        empresas_list.append({
            "id": emp.id,
            "ticker": emp.ticker,
            "nombre_empresa": emp.nombre_empresa,
            "sector": emp.sector,
            "is_active": emp.is_active,
            "precio_actual": float(emp.precio_actual) if emp.precio_actual is not None else None,
            "cambio_diario": float(emp.cambio_diario) if emp.cambio_diario is not None else None,
            "cambio_porcentaje": float(emp.cambio_porcentaje) if emp.cambio_porcentaje is not None else None
        })
        
    print(f"Empresas encontradas: {tickers}")
    
    # 2. Obtener financieros y KPIs
    financials_dict = {}
    kpis_dict = {}
    
    for ticker in tickers:
        financials_dict[ticker] = {"FY": [], "Q": []}
        kpis_dict[ticker] = {"FY": [], "Q": []}
        
        for p_type in ["FY", "Q"]:
            # Obtener datos raw
            raw_query = session.query(DatosFinancierosRaw).filter(
                DatosFinancierosRaw.ticker == ticker
            )
            if p_type == "FY":
                raw_query = raw_query.filter(DatosFinancierosRaw.periodo == "FY")
            else:
                raw_query = raw_query.filter(DatosFinancierosRaw.periodo != "FY")
                
            raw_data = raw_query.order_by(DatosFinancierosRaw.fecha_reporte.desc()).all()
            
            for item in raw_data:
                financials_dict[ticker][p_type].append({
                    "id": item.id,
                    "ticker": item.ticker,
                    "fecha_reporte": item.fecha_reporte.isoformat(),
                    "periodo": item.periodo,
                    "total_revenue": float(item.total_revenue) if item.total_revenue is not None else None,
                    "net_income": float(item.net_income) if item.net_income is not None else None,
                    "total_assets": float(item.total_assets) if item.total_assets is not None else None,
                    "total_liabilities": float(item.total_liabilities) if item.total_liabilities is not None else None,
                    "total_equity": float(item.total_equity) if item.total_equity is not None else None,
                    "diluted_average_shares": float(item.diluted_average_shares) if item.diluted_average_shares is not None else None,
                    "operating_income": float(item.operating_income) if item.operating_income is not None else None,
                    "ebitda": float(item.ebitda) if item.ebitda is not None else None,
                    "current_assets": float(item.current_assets) if item.current_assets is not None else None,
                    "current_liabilities": float(item.current_liabilities) if item.current_liabilities is not None else None,
                    "precio_accion": float(item.precio_accion) if item.precio_accion is not None else None
                })
                
            # Obtener KPIs
            kpi_query = session.query(KpisAnaliticos).filter(
                KpisAnaliticos.ticker == ticker
            )
            if p_type == "FY":
                kpi_query = kpi_query.filter(KpisAnaliticos.periodo == "FY")
            else:
                kpi_query = kpi_query.filter(KpisAnaliticos.periodo != "FY")
                
            kpi_data = kpi_query.order_by(KpisAnaliticos.fecha_reporte.desc()).all()
            
            for item in kpi_data:
                kpis_dict[ticker][p_type].append({
                    "id": item.id,
                    "ticker": item.ticker,
                    "fecha_reporte": item.fecha_reporte.isoformat(),
                    "periodo": item.periodo,
                    "margen_neto": float(item.margen_neto) if item.margen_neto is not None else None,
                    "roe": float(item.roe) if item.roe is not None else None,
                    "roa": float(item.roa) if item.roa is not None else None,
                    "debt_to_equity": float(item.debt_to_equity) if item.debt_to_equity is not None else None,
                    "eps": float(item.eps) if item.eps is not None else None,
                    "current_ratio": float(item.current_ratio) if item.current_ratio is not None else None,
                    "margen_operativo": float(item.margen_operativo) if item.margen_operativo is not None else None,
                    "margen_ebitda": float(item.margen_ebitda) if item.margen_ebitda is not None else None,
                    "precio_accion": float(item.precio_accion) if item.precio_accion is not None else None,
                    "pe_ratio": float(item.pe_ratio) if item.pe_ratio is not None else None
                })
                
    # Escribir archivo JS para el frontend
    output_path = "frontend/src/staticData.js"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("// Datos estáticos autogenerados para demostración en despliegues estáticos\n\n")
        f.write(f"export const STATIC_COMPANIES = {json.dumps(empresas_list, indent=2, cls=CustomEncoder)};\n\n")
        f.write(f"export const STATIC_FINANCIALS = {json.dumps(financials_dict, indent=2, cls=CustomEncoder)};\n\n")
        f.write(f"export const STATIC_KPIS = {json.dumps(kpis_dict, indent=2, cls=CustomEncoder)};\n")
        
    print(f"Datos guardados exitosamente en: {output_path}")
    session.close()

if __name__ == "__main__":
    dump_data()
