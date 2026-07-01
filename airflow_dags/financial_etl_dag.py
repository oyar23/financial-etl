import sys
import os
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator

# Agregar /opt/airflow al path para poder importar el módulo etl
sys.path.append('/opt/airflow')

# Importación perezosa (lazy) de run_etl para evitar fallas durante el parseo del DAG por el scheduler de Airflow
def execute_etl_task(**kwargs):
    """
    Función envolvente que importa y ejecuta el script ETL.
    """
    try:
        from etl.etl import run_etl
        print("Módulo ETL importado con éxito. Iniciando pipeline...")
        # Ejecutamos el ETL para todo el rango (sin parámetros de fecha, para traer lo último disponible)
        run_etl()
    except Exception as e:
        print(f"Error durante la ejecución del ETL en Airflow: {e}")
        raise e

# Definición de argumentos por defecto para el DAG
default_args = {
    'owner': 'finance_team',
    'depends_on_past': False,
    'start_date': datetime(2026, 6, 25),  # Fecha de inicio estática
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

# Definición del DAG
with DAG(
    dag_id='financial_etl_dag',
    default_args=default_args,
    description='Pipeline semanal para la extracción y transformación de datos financieros e inserción en Postgres',
    schedule_interval='@weekly',  # Periodicidad semanal
    catchup=False,               # Evitar ejecuciones históricas acumuladas
    max_active_runs=1,
    tags=['etl', 'financials', 'yfinance'],
) as dag:

    # Única tarea: Ejecutar el script ETL en Python
    run_etl_operator = PythonOperator(
        task_id='run_financial_etl',
        python_callable=execute_etl_task,
    )

    run_etl_operator
