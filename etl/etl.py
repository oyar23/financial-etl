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
                
                # 1. Obtener precio actual y variaciones del ticker en tiempo real
                try:
                    info = ticker.info
                    precio_actual = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('previousClose')
                    cambio_diario = info.get('regularMarketChange')
                    cambio_porcentaje = info.get('regularMarketChangePercent')
                    
                    empresa.precio_actual = clean_numeric_value(precio_actual)
                    empresa.cambio_diario = clean_numeric_value(cambio_diario)
                    empresa.cambio_porcentaje = clean_numeric_value(cambio_porcentaje)
                    db.add(empresa)
                    db.flush()
                    print(f"  Cotización en vivo cargada: ${precio_actual} ({cambio_porcentaje}%)")
                except Exception as e:
                    print(f"  Advertencia: No se pudieron obtener cotizaciones en tiempo real para {ticker_symbol}: {e}")

                # 2. Obtener historial de precios para backfill (últimos 5 años)
                hist_prices = None
                try:
                    hist_df = ticker.history(period="5y")
                    if not hist_df.empty:
                        hist_prices = hist_df['Close']
                        print(f"  Historial de precios cargado ({len(hist_prices)} registros diarios).")
                except Exception as e:
                    print(f"  Advertencia: No se pudo obtener el historial de cotizaciones para {ticker_symbol}: {e}")

                # Definir los conjuntos de datos a extraer: Anual y Trimestral
                datasets = [
                    {
                        "tipo": "Anual",
                        "financials": ticker.financials,
                        "balance_sheet": ticker.balance_sheet,
                        "get_period": lambda d: "FY"
                    },
                    {
                        "tipo": "Trimestral",
                        "financials": ticker.quarterly_financials,
                        "balance_sheet": ticker.quarterly_balance_sheet,
                        "get_period": lambda d: f"Q{(d.month - 1) // 3 + 1}"
                    }
                ]
                
                for ds in datasets:
                    tipo_ds = ds["tipo"]
                    financials_df = ds["financials"]
                    balance_sheet_df = ds["balance_sheet"]
                    get_period_fn = ds["get_period"]
                    
                    if financials_df is None or financials_df.empty or balance_sheet_df is None or balance_sheet_df.empty:
                        print(f"  Advertencia: No se obtuvieron datos financieros {tipo_ds} para {ticker_symbol}. Saltando...")
                        continue
                    
                    print(f"  Procesando datos {tipo_ds} para {ticker_symbol}...")
                    
                    # Iterar sobre las fechas de los reportes en financials
                    for timestamp_col in financials_df.columns:
                        # Convertir a datetime.date
                        if isinstance(timestamp_col, pd.Timestamp):
                            fecha_rep = timestamp_col.date()
                        else:
                            fecha_rep = pd.to_datetime(timestamp_col).date()
                        
                        # Determinar periodo
                        periodo = get_period_fn(fecha_rep)
                        
                        # Aplicar filtro de rango de fechas si se proporciona
                        if parsed_start and fecha_rep < parsed_start:
                            continue
                        if parsed_end and fecha_rep > parsed_end:
                            continue
                        
                        print(f"    Reporte: {fecha_rep} | Periodo: {periodo}")
                        
                        # Alinear el precio de cierre de la acción al día del reporte
                        precio_accion = None
                        if hist_prices is not None and not hist_prices.empty:
                            try:
                                # Encontrar la fecha más cercana disponible en el índice de precios
                                report_datetime = pd.to_datetime(fecha_rep).tz_localize(hist_prices.index.tz)
                                idx = hist_prices.index.get_indexer([report_datetime], method='nearest')[0]
                                if idx != -1:
                                    precio_accion = clean_numeric_value(hist_prices.iloc[idx])
                            except Exception as e:
                                print(f"      No se pudo alinear el precio de la acción para la fecha {fecha_rep}: {e}")

                        # 1. Extracción y Normalización de Datos Raw
                        raw_revenue = get_df_value(financials_df, 'Total Revenue', timestamp_col)
                        raw_net_income = get_df_value(financials_df, 'Net Income', timestamp_col)
                        raw_assets = get_df_value(balance_sheet_df, 'Total Assets', timestamp_col)
                        
                        raw_liabilities = get_df_value(
                            balance_sheet_df, 
                            'Total Liabilities Net Minority Interest', 
                            timestamp_col,
                            fallback_labels=['Total Liabilities']
                        )
                        
                        raw_equity = get_df_value(
                            balance_sheet_df, 
                            'Stockholders Equity', 
                            timestamp_col,
                            fallback_labels=['Common Stock Equity', 'Total Equity Gross Minority Interest']
                        )
                        
                        raw_shares = get_df_value(
                            financials_df,
                            'Diluted Average Shares',
                            timestamp_col,
                            fallback_labels=['Basic Average Shares', 'Average Shares']
                        )
                        
                        raw_op_income = get_df_value(
                            financials_df,
                            'Operating Income',
                            timestamp_col
                        )
                        
                        raw_ebitda = get_df_value(
                            financials_df,
                            'EBITDA',
                            timestamp_col,
                            fallback_labels=['Normalized EBITDA']
                        )
                        
                        raw_curr_assets = get_df_value(
                            balance_sheet_df,
                            'Current Assets',
                            timestamp_col
                        )
                        
                        raw_curr_liabilities = get_df_value(
                            balance_sheet_df,
                            'Current Liabilities',
                            timestamp_col
                        )
                        
                        # Limpiar y normalizar los números
                        total_revenue = clean_numeric_value(raw_revenue)
                        net_income = clean_numeric_value(raw_net_income)
                        total_assets = clean_numeric_value(raw_assets)
                        total_liabilities = clean_numeric_value(raw_liabilities)
                        total_equity = clean_numeric_value(raw_equity)
                        
                        diluted_average_shares = clean_numeric_value(raw_shares)
                        operating_income = clean_numeric_value(raw_op_income)
                        ebitda = clean_numeric_value(raw_ebitda)
                        current_assets = clean_numeric_value(raw_curr_assets)
                        current_liabilities = clean_numeric_value(raw_curr_liabilities)
                        
                        if total_revenue is None and net_income is None:
                            print(f"      Advertencia: Datos vacíos para {ticker_symbol} en {fecha_rep} ({periodo}). Saltando...")
                            continue
                        
                        # 2. Transformación: Cálculo de KPIs
                        # Margen Neto
                        margen_neto = None
                        if net_income is not None and total_revenue and total_revenue != 0:
                            margen_neto = clean_numeric_value(net_income / total_revenue, decimals=4)
                        
                        # ROE
                        roe = None
                        if net_income is not None and total_equity and total_equity != 0:
                            roe = clean_numeric_value(net_income / total_equity, decimals=4)
                            
                        # ROA
                        roa = None
                        if net_income is not None and total_assets and total_assets != 0:
                            roa = clean_numeric_value(net_income / total_assets, decimals=4)
                            
                        # Debt to Equity
                        debt_to_equity = None
                        if total_liabilities is not None and total_equity and total_equity != 0:
                            debt_to_equity = clean_numeric_value(total_liabilities / total_equity, decimals=4)
                            
                        # EPS
                        eps = None
                        if net_income is not None and diluted_average_shares and diluted_average_shares != 0:
                            eps = clean_numeric_value(net_income / diluted_average_shares, decimals=4)
                            
                        # Current Ratio
                        current_ratio = None
                        if current_assets is not None and current_liabilities and current_liabilities != 0:
                            current_ratio = clean_numeric_value(current_assets / current_liabilities, decimals=4)
                            
                        # Margen Operativo
                        margen_operativo = None
                        if operating_income is not None and total_revenue and total_revenue != 0:
                            margen_operativo = clean_numeric_value(operating_income / total_revenue, decimals=4)
                            
                        # Margen EBITDA
                        margen_ebitda = None
                        if ebitda is not None and total_revenue and total_revenue != 0:
                            margen_ebitda = clean_numeric_value(ebitda / total_revenue, decimals=4)
                            
                        # P/E Ratio histórico al reporte
                        pe_ratio = None
                        if eps is not None and eps > 0 and precio_accion is not None:
                            pe_ratio = clean_numeric_value(precio_accion / eps, decimals=2)
                        
                        # 3. Carga: Upsert seguro en Postgres
                        # A. Inserción de Datos Financieros Raw
                        stmt_raw = insert(DatosFinancierosRaw).values(
                            ticker=ticker_symbol,
                            fecha_reporte=fecha_rep,
                            periodo=periodo,
                            total_revenue=total_revenue,
                            net_income=net_income,
                            total_assets=total_assets,
                            total_liabilities=total_liabilities,
                            total_equity=total_equity,
                            diluted_average_shares=diluted_average_shares,
                            operating_income=operating_income,
                            ebitda=ebitda,
                            current_assets=current_assets,
                            current_liabilities=current_liabilities,
                            precio_accion=precio_accion
                        )
                        stmt_raw_upsert = stmt_raw.on_conflict_do_update(
                            constraint='uq_raw_ticker_fecha_periodo',
                            set_={
                                'total_revenue': stmt_raw.excluded.total_revenue,
                                'net_income': stmt_raw.excluded.net_income,
                                'total_assets': stmt_raw.excluded.total_assets,
                                'total_liabilities': stmt_raw.excluded.total_liabilities,
                                'total_equity': stmt_raw.excluded.total_equity,
                                'diluted_average_shares': stmt_raw.excluded.diluted_average_shares,
                                'operating_income': stmt_raw.excluded.operating_income,
                                'ebitda': stmt_raw.excluded.ebitda,
                                'current_assets': stmt_raw.excluded.current_assets,
                                'current_liabilities': stmt_raw.excluded.current_liabilities,
                                'precio_accion': stmt_raw.excluded.precio_accion
                            }
                        )
                        db.execute(stmt_raw_upsert)
                        
                        # B. Inserción de KPIs Analíticos
                        stmt_kpis = insert(KpisAnaliticos).values(
                            ticker=ticker_symbol,
                            fecha_reporte=fecha_rep,
                            periodo=periodo,
                            margen_neto=margen_neto,
                            roe=roe,
                            roa=roa,
                            debt_to_equity=debt_to_equity,
                            eps=eps,
                            current_ratio=current_ratio,
                            margen_operativo=margen_operativo,
                            margen_ebitda=margen_ebitda,
                            precio_accion=precio_accion,
                            pe_ratio=pe_ratio
                        )
                        stmt_kpis_upsert = stmt_kpis.on_conflict_do_update(
                            constraint='uq_kpi_ticker_fecha_periodo',
                            set_={
                                'margen_neto': stmt_kpis.excluded.margen_neto,
                                'roe': stmt_kpis.excluded.roe,
                                'roa': stmt_kpis.excluded.roa,
                                'debt_to_equity': stmt_kpis.excluded.debt_to_equity,
                                'eps': stmt_kpis.excluded.eps,
                                'current_ratio': stmt_kpis.excluded.current_ratio,
                                'margen_operativo': stmt_kpis.excluded.margen_operativo,
                                'margen_ebitda': stmt_kpis.excluded.margen_ebitda,
                                'precio_accion': stmt_kpis.excluded.precio_accion,
                                'pe_ratio': stmt_kpis.excluded.pe_ratio
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
