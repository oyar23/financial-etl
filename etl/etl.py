import sys
import os
import argparse
import datetime
import math
import pandas as pd
import numpy as np
import yfinance as yf

# Agregar el directorio raíz al path para poder importar módulos locales
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from etl.db import SessionLocal
    from etl.models import EmpresaFavorita, DatosFinancierosRaw, KpisAnaliticos
except ModuleNotFoundError:
    from db import SessionLocal
    from models import EmpresaFavorita, DatosFinancierosRaw, KpisAnaliticos
from sqlalchemy.dialects.postgresql import insert

def clean_numeric_value(val, decimals=2):
    """
    Normaliza y limpia los valores numéricos de yfinance.
    Retorna None si el valor es nulo (NaN, inf, etc.) para que se guarde como NULL en la base de datos,
    o el número redondeado a los decimales especificados.
    """
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if math.isnan(val) or math.isinf(val):
            return None
        return round(float(val), decimals)
    if pd.isna(val):
        return None
    try:
        f_val = float(val)
        if math.isnan(f_val) or math.isinf(f_val):
            return None
        return round(f_val, decimals)
    except (ValueError, TypeError):
        return None

def get_df_value(df, label, date, fallback_labels=None):
    """
    Obtiene el valor de un DataFrame de yfinance para una fila (métrica) y columna (fecha) específicas.
    Soporta múltiples etiquetas de fila alternativas y alineación aproximada de fechas.
    """
    if df is None or df.empty:
        return None
    
    labels = [label] + (fallback_labels or [])
    for lbl in labels:
        if lbl in df.index:
            col_match = None
            for col in df.columns:
                if col == date:
                    col_match = col
                    break
                # Si las fechas están en formatos ligeramente diferentes, comparar solo el año y mes
                if str(col).split()[0] == str(date).split()[0]:
                    col_match = col
                    break
            
            if col_match is not None:
                val = df.loc[lbl, col_match]
                # Si hay filas duplicadas con el mismo índice, tomar el primer valor
                if hasattr(val, 'iloc'):
                    val = val.iloc[0]
                return val
    return None

def run_etl(start_date=None, end_date=None):
    """
    Ejecuta el pipeline ETL:
    1. Lee las empresas activas desde la BD.
    2. Consulta yfinance para obtener los datos fundamentales.
    3. Normaliza, calcula KPIs y realiza Upsert en PostgreSQL.
    """
    print(f"[{datetime.datetime.now()}] Iniciando ejecución del ETL...")
    db = SessionLocal()
    
    # Rango de fechas para filtrado opcional
    parsed_start = None
    parsed_end = None
    if start_date:
        parsed_start = datetime.datetime.strptime(start_date, "%Y-%m-%d").date()
    if end_date:
        parsed_end = datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
        
    try:
        # Obtener empresas activas de la BD
        empresas_activas = db.query(EmpresaFavorita).filter(EmpresaFavorita.is_active == True).all()
        print(f"Se encontraron {len(empresas_activas)} empresas activas para procesar.")
        
        for empresa in empresas_activas:
            ticker_symbol = empresa.ticker
            print(f"\nProcesando ticker: {ticker_symbol} ({empresa.nombre_empresa})...")
            
            try:
                # Consultar yfinance
                ticker = yf.Ticker(ticker_symbol)
                
                # Obtener Income Statement (financials) y Balance Sheet
                financials = ticker.financials
                balance_sheet = ticker.balance_sheet
                
                if financials.empty or balance_sheet.empty:
                    print(f"Advertencia: No se obtuvieron datos financieros para {ticker_symbol}. Saltando...")
                    continue
                
                # Iterar sobre las fechas de los reportes en financials
                for timestamp_col in financials.columns:
                    # Convertir a datetime.date
                    if isinstance(timestamp_col, pd.Timestamp):
                        fecha_rep = timestamp_col.date()
                    else:
                        fecha_rep = pd.to_datetime(timestamp_col).date()
                    
                    # Aplicar filtro de rango de fechas si se proporciona
                    if parsed_start and fecha_rep < parsed_start:
                        continue
                    if parsed_end and fecha_rep > parsed_end:
                        continue
                    
                    print(f"  Procesando reporte con fecha: {fecha_rep}")
                    
                    # 1. Extracción y Normalización de Datos Raw
                    raw_revenue = get_df_value(financials, 'Total Revenue', timestamp_col)
                    raw_net_income = get_df_value(financials, 'Net Income', timestamp_col)
                    raw_assets = get_df_value(balance_sheet, 'Total Assets', timestamp_col)
                    
                    # Fallbacks para Liabilities
                    raw_liabilities = get_df_value(
                        balance_sheet, 
                        'Total Liabilities Net Minority Interest', 
                        timestamp_col,
                        fallback_labels=['Total Liabilities']
                    )
                    
                    # Fallbacks para Equity
                    raw_equity = get_df_value(
                        balance_sheet, 
                        'Stockholders Equity', 
                        timestamp_col,
                        fallback_labels=['Common Stock Equity', 'Total Equity Gross Minority Interest']
                    )
                    
                    # Limpiar y normalizar los números
                    total_revenue = clean_numeric_value(raw_revenue)
                    net_income = clean_numeric_value(raw_net_income)
                    total_assets = clean_numeric_value(raw_assets)
                    total_liabilities = clean_numeric_value(raw_liabilities)
                    total_equity = clean_numeric_value(raw_equity)
                    
                    # Si faltan datos críticos, imprimir advertencia y continuar
                    if total_revenue is None and net_income is None:
                        print(f"    Advertencia: Datos de ingresos vacíos para {ticker_symbol} en {fecha_rep}. Saltando...")
                        continue
                    
                    # 2. Transformación: Cálculo de KPIs
                    # Margen Neto = Net Income / Total Revenue
                    margen_neto = None
                    if net_income is not None and total_revenue and total_revenue != 0:
                        margen_neto = clean_numeric_value(net_income / total_revenue, decimals=4)
                    
                    # ROE = Net Income / Total Equity
                    roe = None
                    if net_income is not None and total_equity and total_equity != 0:
                        roe = clean_numeric_value(net_income / total_equity, decimals=4)
                        
                    # ROA = Net Income / Total Assets
                    roa = None
                    if net_income is not None and total_assets and total_assets != 0:
                        roa = clean_numeric_value(net_income / total_assets, decimals=4)
                        
                    # Debt to Equity = Total Liabilities / Total Equity
                    debt_to_equity = None
                    if total_liabilities is not None and total_equity and total_equity != 0:
                        debt_to_equity = clean_numeric_value(total_liabilities / total_equity, decimals=4)
                    
                    # 3. Carga: Upsert seguro en Postgres
                    # A. Inserción de Datos Financieros Raw
                    stmt_raw = insert(DatosFinancierosRaw).values(
                        ticker=ticker_symbol,
                        fecha_reporte=fecha_rep,
                        total_revenue=total_revenue,
                        net_income=net_income,
                        total_assets=total_assets,
                        total_liabilities=total_liabilities,
                        total_equity=total_equity
                    )
                    stmt_raw_upsert = stmt_raw.on_conflict_do_update(
                        constraint='uq_raw_ticker_fecha',
                        set_={
                            'total_revenue': stmt_raw.excluded.total_revenue,
                            'net_income': stmt_raw.excluded.net_income,
                            'total_assets': stmt_raw.excluded.total_assets,
                            'total_liabilities': stmt_raw.excluded.total_liabilities,
                            'total_equity': stmt_raw.excluded.total_equity
                        }
                    )
                    db.execute(stmt_raw_upsert)
                    
                    # B. Inserción de KPIs Analíticos
                    stmt_kpis = insert(KpisAnaliticos).values(
                        ticker=ticker_symbol,
                        fecha_reporte=fecha_rep,
                        margen_neto=margen_neto,
                        roe=roe,
                        roa=roa,
                        debt_to_equity=debt_to_equity
                    )
                    stmt_kpis_upsert = stmt_kpis.on_conflict_do_update(
                        constraint='uq_kpi_ticker_fecha',
                        set_={
                            'margen_neto': stmt_kpis.excluded.margen_neto,
                            'roe': stmt_kpis.excluded.roe,
                            'roa': stmt_kpis.excluded.roa,
                            'debt_to_equity': stmt_kpis.excluded.debt_to_equity
                        }
                    )
                    db.execute(stmt_kpis_upsert)
                
                db.commit()
                print(f"Datos guardados exitosamente para {ticker_symbol}.")
                
            except Exception as ex:
                db.rollback()
                print(f"Error procesando el ticker {ticker_symbol}: {ex}")
                continue
                
    except Exception as e:
        print(f"Error general en la ejecución del ETL: {e}")
    finally:
        db.close()
        print(f"[{datetime.datetime.now()}] Ejecución del ETL finalizada.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pipeline ETL de Datos Financieros.")
    parser.add_argument("--start-date", type=str, help="Fecha de inicio (YYYY-MM-DD) para filtrar reportes.")
    parser.add_argument("--end-date", type=str, help="Fecha de fin (YYYY-MM-DD) para filtrar reportes.")
    args = parser.parse_args()
    
    run_etl(start_date=args.start_date, end_date=args.end_date)
