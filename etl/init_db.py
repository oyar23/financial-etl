import sys
import os
# Agregar el directorio raíz al path para poder importar módulos locales
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from etl.db import engine, Base, SessionLocal
    from etl.models import EmpresaFavorita
except ModuleNotFoundError:
    from db import engine, Base, SessionLocal
    from models import EmpresaFavorita
from sqlalchemy.dialects.postgresql import insert

def init_db():
    print("Iniciando la base de datos...")
    
    # Crear todas las tablas definidas en los modelos
    Base.metadata.create_all(bind=engine)
    print("Tablas creadas correctamente.")
    
    # Datos de semilla (Seed Data) para las empresas favoritas
    empresas_semilla = [
        {"ticker": "AAPL", "nombre_empresa": "Apple Inc.", "sector": "Tecnología / Electrónica de Consumo", "is_active": True},
        {"ticker": "MSFT", "nombre_empresa": "Microsoft Corporation", "sector": "Tecnología / Software", "is_active": True},
        {"ticker": "TSLA", "nombre_empresa": "Tesla, Inc.", "sector": "Automotriz / Energía Limpia", "is_active": True},
        {"ticker": "AMZN", "nombre_empresa": "Amazon.com, Inc.", "sector": "Consumo Cíclico / Comercio Electrónico", "is_active": True}
    ]
    
    # Insertar o actualizar utilizando Upsert (idempotencia)
    db = SessionLocal()
    try:
        for datos in empresas_semilla:
            # Crear sentencia de inserción de Postgres
            stmt = insert(EmpresaFavorita).values(**datos)
            
            # Si hay conflicto en la columna 'ticker' (que es Unique), actualizar el nombre, sector y estado activo
            stmt_upsert = stmt.on_conflict_do_update(
                index_elements=['ticker'],
                set_={
                    "nombre_empresa": stmt.excluded.nombre_empresa,
                    "sector": stmt.excluded.sector,
                    "is_active": stmt.excluded.is_active
                }
            )
            
            # Ejecutar la sentencia
            db.execute(stmt_upsert)
        
        db.commit()
        print("Empresas semilla insertadas/actualizadas con éxito.")
        
        # Consultar y mostrar los registros actuales para verificación
        empresas = db.query(EmpresaFavorita).all()
        print("\nEmpresas registradas actualmente:")
        for emp in empresas:
            print(f"- [{emp.ticker}] {emp.nombre_empresa} | Sector: {emp.sector} | Activo: {emp.is_active}")
            
    except Exception as e:
        db.rollback()
        print(f"Error al inicializar la base de datos: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
