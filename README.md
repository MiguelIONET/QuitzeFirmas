# Generador de Firmas Quitze

Abre `index.html` desde un servidor local para usar el administrador. La herramienta busca datos automáticamente en este orden:

1. `googleDocsCsvUrl` dentro de `signature-config.js`.
2. `empleados.csv`.
3. `empleados.json`.

Para Google, publica tu hoja como CSV y pega la URL en `signature-config.js`:

```js
googleDocsCsvUrl: "https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
```

Columnas aceptadas: `nombre`, `puesto`, `telefono`, `correo`, `foto`, `pagina_web`, `facebook`, `instagram`, `linkedin`, `youtube`, `badge1_label`, `badge1_image`, `badge1_link` hasta `badge6_label`, `badge6_image`, `badge6_link`.

La plantilla base está en `Firma(plantilla).htm`.
