# Financial ETL & Valuation Dashboard

> **🚀 Demo en Vivo (Modo Estático):** [https://finance-pipeline.netlify.app/](https://finance-pipeline.netlify.app/)
>
> *Proyecto orientado a perfiles de **Data Engineering** y **Data Analysis**.*

Una infraestructura de datos contenerizada y plataforma web diseñada para realizar la extracción, transformación, carga (ETL) y análisis fundamental de empresas cotizadas. Permite programar la recopilación de reportes anuales/trimestrales y precios históricos de acciones desde Yahoo Finance (`yfinance`), almacenar y modelar los datos en PostgreSQL de manera normalizada, y presentarlos en un dashboard interactivo de grado profesional (ROE/ROA, Altman Score, desgloses YoY y Análisis DuPont).

---


## 🛠️ Arquitectura del Sistema

El proyecto está diseñado bajo una arquitectura contenerizada y desacoplada compuesta por los siguientes servicios:

1.  **Orquestador de Datos (ETL & yfinance)**:
    *   Extrae estados financieros (Balance y Pérdidas y Ganancias) tanto **Anuales** como **Trimestrales**.
    *   Descarga el historial de cotizaciones de los últimos 5 años y alinea el precio de cierre de la acción al día exacto de cada reporte financiero.
    *   Calcula dinámicamente indicadores (Márgenes EBITDA/Neto/Operativo, EPS, Liquidez, Apalancamiento y Ratios P/E históricos).
2.  **Base de Datos Relacional (PostgreSQL)**:
    *   Estructura normalizada en tres tablas: `empresas_favoritas`, `datos_financieros_raw` y `kpis_analiticos`.
    *   Políticas de cascada para permitir la eliminación completa de empresas y reportes históricos.
3.  **API REST (FastAPI & Swagger)**:
    *   Expone endpoints para consultar las empresas activas, sus balances, KPIs de rentabilidad y disparadores manuales del pipeline.
    *   Documentación interactiva auto-generada y accesible desde la interfaz de Swagger.
4.  **Dashboard Interactivo (React + Vite)**:
    *   Estética premium con soporte para modo oscuro, gradientes y diseño responsivo.
    *   **Sectorización de Gráficos**: Evita problemas de escalas mezclando porcentajes (`%`), ratios (`x`) y absolutos (`$`) en gráficos independientes.
    *   **Santo Grial del Inversor**: Superposición visual del precio histórico de cierre de la acción frente a los beneficios por acción (EPS).
    *   **Desglose DuPont**: Representación interactiva de la ecuación que descompone el ROE en Eficiencia Operativa, Eficiencia de Activos y Apalancamiento.
    *   **Variación YoY**: Indicadores dinámicos que muestran el crecimiento frente al año o trimestre del año anterior.

---

## 🚀 Despliegue con Docker Compose

La plataforma completa está contenerizada para arrancar con un solo comando.

### Requisitos Previos
*   [Docker](https://www.docker.com/) instalado en tu máquina.
*   [Docker Compose](https://docs.docker.com/compose/) habilitado.

### Paso 1: Levantar los servicios
En la raíz del proyecto, ejecuta el siguiente comando para compilar y levantar los contenedores:
```bash
docker compose up --build -d
```

Esto iniciará los siguientes servicios en tu máquina local:
*   **Frontend (Vite / React)**: [http://localhost:5173](http://localhost:5173)
*   **Backend (FastAPI REST)**: [http://localhost:8000](http://localhost:8000) (Swagger en `/docs`)
*   **Base de Datos (PostgreSQL)**: Puerto local `5433`
*   **pgAdmin**: Interfaz web para visualizar bases de datos.

### Paso 2: Inicializar Base de Datos con Datos Semilla (Seeds)
Para poder visualizar y testear la interfaz inmediatamente con datos reales de ejemplo, el proyecto incluye un script de inicialización que creará la estructura de tablas e insertará 4 empresas semilla: **Apple (`AAPL`), Microsoft (`MSFT`), Tesla (`TSLA`) y Amazon (`AMZN`)**.

Para correr este inicializador en tu entorno local (asegúrate de tener las dependencias de Python instaladas con `pip install -r requirements.txt` o ejecútalo dentro del contenedor):
```bash
python etl/init_db.py
```
*Esto registrará las empresas iniciales en la base de datos de manera limpia.*

### Paso 3: Correr el Pipeline ETL (Descarga Histórica)
Una vez que las tablas están creadas y las empresas registradas, puedes descargar todo su historial financiero de los últimos 5 años y sus cotizaciones reales. Puedes hacerlo de dos formas:
1.  **Desde la Interfaz Web**: Haciendo clic en el botón **"Correr ETL"** de la cabecera.
2.  **Desde la Terminal**: Ejecutando el pipeline manualmente en local:
    ```bash
    python etl/etl.py
    ```

### 🖥️ Modo Demostración (Despliegues Estáticos / Netlify)
Si el frontend se despliega de forma independiente en un servidor estático (como Netlify o Vercel) y no se puede conectar a la API de FastAPI (por ejemplo, porque Docker local está apagado):
*   **Fallback Automático**: El dashboard detectará la desconexión y activará automáticamente el **Modo Demostración**.
*   **Datos Históricos Incluidos**: Cargarás los datos históricos reales recopilados (Balances, KPIs, desgloses YoY y DuPont) para **AAPL, MSFT, TSLA y AMZN** de forma estática desde `frontend/src/staticData.js`.
*   **Alerta en Pantalla**: Mostrará una advertencia discreta al usuario invitándolo a correr el proyecto de manera local para habilitar búsquedas dinámicas, sumar empresas personalizadas o ejecutar el pipeline ETL en tiempo real.


---

## 🔒 Variables de Entorno y Seguridad

El sistema utiliza un archivo `.env` en la raíz del proyecto para configurar las credenciales de conexión interna entre el backend, la base de datos y pgAdmin. 

*   Todas las credenciales por defecto están configuradas para entornos locales de desarrollo.
*   **Nota de Seguridad**: Nunca incluyas el archivo `.env` en sistemas de control de versiones (Git) al subir cambios a producción, ni expongas tokens o contraseñas reales en repositorios públicos.
