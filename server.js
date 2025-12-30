// server.js
const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");

// ======== CONFIGURACIÓN ========
const stripe = Stripe("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");

const EMAIL_USER = "masajeadordeojos068@gmail.com"; // tu email
const EMAIL_PASS = "TU_CONTRASEÑA_DE_APP";           // contraseña de aplicación Gmail
const TIENDA_NOMBRE = "Masajeador de Ojos Portátil";

const PORT = 3000;

// ======== APP ========
const app = express();
app.use(bodyParser.json());

// ======== BASE DE DATOS ========
const db = new sqlite3.Database("./pedidos.db");
db.run(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    email TEXT,
    telefono TEXT,
    direccion TEXT,
    producto TEXT,
    cantidad INTEGER,
    tracking TEXT,
    fecha TEXT
  )
`);

// ======== NODemailer ========
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

// ======== RUTA PEDIDO ========
app.post("/pedido", async (req, res) => {
  const { nombre, email, telefono, direccion, cantidad, token } = req.body;
  const producto = TIENDA_NOMBRE;

  try {
    // ======== COBRO STRIPE ========
    const charge = await stripe.paymentIntents.create({
      amount: cantidad * 4990, // Precio en centavos (49,90€ por unidad)
      currency: "eur",
      payment_method: token,
      confirm: true,
    });

    // ======== GUARDAR PEDIDO ========
    const fecha = new Date().toISOString();
    db.run(
      `INSERT INTO pedidos (nombre,email,telefono,direccion,producto,cantidad,fecha)
       VALUES (?,?,?,?,?,?,?)`,
      [nombre, email, telefono, direccion, producto, cantidad, fecha]
    );

    // ======== GENERAR FACTURA PDF ========
    const fileName = `factura_${Date.now()}.pdf`;
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(fileName));
    doc.fontSize(22).text("Factura de Compra", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Tienda: ${TIENDA_NOMBRE}`);
    doc.text(`Cliente: ${nombre}`);
    doc.text(`Email: ${email}`);
    doc.text(`Teléfono: ${telefono}`);
    doc.text(`Dirección: ${direccion}`);
    doc.text(`Producto: ${producto}`);
    doc.text(`Cantidad: ${cantidad}`);
    doc.text(`Precio unitario: 49,90€`);
    doc.text(`Total: ${(cantidad * 49.9).toFixed(2)}€`);
    doc.text(`Fecha: ${fecha}`);
    doc.end();

    // ======== ENVIAR EMAIL AL CLIENTE ========
    await transporter.sendMail({
      from: `"${TIENDA_NOMBRE}" <${EMAIL_USER}>`,
      to: email,
      subject: "Confirmación de tu pedido",
      text: `Gracias por tu compra en ${TIENDA_NOMBRE}. Adjuntamos tu factura.`,
      attachments: [{ filename: fileName, path: fileName }]
    });

    // ======== ENLACE SEMI-AUTOMÁTICO PARA PROVEEDOR ========
    const proveedorLink = `https://tu-proveedor.com/pedido?nombre=${encodeURIComponent(nombre)}&direccion=${encodeURIComponent(direccion)}&producto=${encodeURIComponent(producto)}&cantidad=${cantidad}`;

    res.json({ success: true, message: "Pedido recibido correctamente", proveedorLink });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error procesando el pedido" });
  }
});

// ======== RUTA ACTUALIZAR TRACKING ========
app.post("/tracking", (req, res) => {
  const { pedidoId, tracking } = req.body;
  db.run(`UPDATE pedidos SET tracking=? WHERE id=?`, [tracking, pedidoId], (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Error actualizando tracking" });
    }

    // Obtener email del cliente
    db.get(`SELECT email FROM pedidos WHERE id=?`, [pedidoId], (err, row) => {
      if (row) {
        transporter.sendMail({
          from: `"${TIENDA_NOMBRE}" <${EMAIL_USER}>`,
          to: row.email,
          subject: "Tu pedido está en camino",
          text: `Tu pedido ha sido enviado. Número de seguimiento: ${tracking}`
        });
      }
    });

    res.json({ success: true, message: "Tracking actualizado y enviado al cliente" });
  });
});

// ======== INICIAR SERVIDOR ========
app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
