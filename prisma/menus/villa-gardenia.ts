// Menú de Villa Gardenia (carta impresa de 2026) para cargarlo con prisma/load-menu.ts.
// Grupos = opciones a elegir y extras con costo; variantes = tamaños o precios distintos de un mismo platillo.
// Reymen no admite precios negativos en opciones: lo que cambia de precio según la proteína va como variante.
import type { MenuSpec } from "../../src/lib/menu-loader";

const free = (...names: string[]) => names.map((name) => ({ name }));
const U = (price: number) => [{ label: "Único", price }];
const VL = (vaso: number, litro: number) => [{ label: "Vaso", price: vaso }, { label: "Litro", price: litro }];

export const villaGardeniaMenu: MenuSpec = {
  groups: [
    { key: "chilBase", name: "Chilaquiles · Base", min: 1, max: 1, options: free("Totopos horneados", "Totopos tradicionales") },
    { key: "chilSalsa", name: "Chilaquiles · Salsa", min: 1, max: 1, options: free("Verde", "Roja", "Suiza") },
    { key: "chilProt", name: "Chilaquiles · Proteína", min: 1, max: 1, options: free("Pollo", "Huevo estrellado", "Huevo revuelto", "Chorizo de champiñón") },
    { key: "huevEstilo", name: "Huevos · Estilo", min: 1, max: 1, options: free("Clásicos (pavo y queso gratinado)", "Omelette (espinaca y queso)", "Huerto (brócoli)", "Miguitas especiales", "Divorciados", "Rancheros", "A la mexicana", "Con espinaca y tomate") },
    { key: "huevPrep", name: "Huevos · Preparación", min: 0, max: 1, options: free("Revueltos", "Estrellados") },
    { key: "spread", name: "Spread", min: 1, max: 1, options: free("Miel", "Crema de cacahuate", "Crema de almendra", "Nutella") },
    { key: "spreadParadise", name: "Spread · Paradise", min: 1, max: 1, options: free("Cacahuate", "Almendra", "Nutella", "Moca canela") },
    { key: "crema", name: "Crema (cacahuate o almendra)", min: 1, max: 1, options: free("Crema de cacahuate", "Crema de almendra") },
    { key: "acomp", name: "Acompañamiento", min: 1, max: 1, options: free("Papitas", "Camote horneado") },
    { key: "tacoGuisado", name: "Tacos · Guisado", min: 1, max: 1, options: free("Huevo revuelto", "Pechuga de pollo", "Guacamole", "Frijoles de chipotle con queso panela", "Quesadilla con pechuga de pavo") },
    { key: "entomRelleno", name: "Entomatadas · Relleno", min: 1, max: 1, options: free("Pechuga de pollo", "Queso panela") },
    {
      key: "extras", name: "Extras", min: 0, max: 10,
      options: [
        { name: "Frutas", price: 15 }, { name: "Tomate", price: 15 }, { name: "Frijoles", price: 15 }, { name: "Chile", price: 15 },
        { name: "Camote", price: 20 }, { name: "Papas", price: 20 }, { name: "Aguacate", price: 20 }, { name: "Huevo", price: 20 },
        { name: "Queso", price: 20 }, { name: "Yogurt", price: 20 }, { name: "Pechuga de pavo", price: 20 }, { name: "Pechuga de pollo", price: 40 },
      ],
    },
    { key: "avoExtra", name: "Avocado Toast · Extra", min: 0, max: 2, options: [{ name: "Huevo", price: 20 }, { name: "Chorizo de champiñón", price: 20 }, { name: "Salmón a la plancha 100 g", price: 70 }] },
    { key: "proteina", name: "Proteína en polvo", min: 0, max: 1, options: [{ name: "Vainilla", price: 60 }, { name: "Chocolate", price: 60 }] },
    { key: "leche", name: "Leche", min: 1, max: 1, options: free("Entera", "Deslactosada", "Almendra", "Coco") },
    { key: "persFrutas", name: "Personalizado · Frutas", min: 1, max: 2, options: free("Fresa / Berries", "Papaya", "Melón", "Plátano", "Mango") },
    { key: "persBase", name: "Personalizado · Base", min: 1, max: 1, options: free("Leche entera", "Leche deslactosada", "Leche de almendra", "Leche de coco", "Naranja") },
    { key: "persGrasa", name: "Personalizado · Grasa", min: 1, max: 1, options: free("Coco", "Linaza", "Cacao", "Peanut butter", "Almendra / Nutella") },
    { key: "persExtras", name: "Personalizado · Extras", min: 0, max: 5, options: [{ name: "Proteína", price: 60 }, { name: "Yogurt", price: 30 }, { name: "Café espresso", price: 20 }, { name: "Avena", price: 15 }, { name: "Espinaca", price: 15 }] },
    { key: "coca", name: "Coca-Cola", min: 1, max: 1, options: free("Normal", "Sin azúcar") },
    { key: "dcBebida", name: "Desayuno completo · Bebida", min: 1, max: 1, options: free("Jugo", "Agua del día") },
  ],
  categories: [
    {
      name: "Desayunos",
      dishes: [
        { name: "Chilaquiles Gardenia", variants: [{ label: "Chicos", price: 120 }, { label: "Grandes", price: 160 }], groups: ["chilBase", "chilSalsa", "chilProt", "extras"] },
        { name: "Huevos al Gusto", variants: U(150), groups: ["huevEstilo", "huevPrep", "extras"] },
        { name: "Molletes", variants: U(130), groups: ["extras"] },
        { name: "Waffles", variants: U(170), groups: ["spread"] },
        { name: "Acaí Tropical Bowl", variants: U(160), groups: ["proteina"] },
        { name: "Bowl de Frutas", variants: U(150), groups: ["spread"] },
        // Uno por plato: si fuera un solo platillo, el POS pediría la salsa de los chilaquiles aunque eligieran huevos.
        { name: "Desayuno Completo · Chilaquiles", variants: U(265), groups: ["chilBase", "chilSalsa", "chilProt", "dcBebida"] },
        { name: "Desayuno Completo · Huevos", variants: U(265), groups: ["huevEstilo", "huevPrep", "dcBebida"] },
      ],
    },
    {
      name: "Sandwiches",
      dishes: [
        { name: "Sándwich Clásico", variants: U(90), groups: ["acomp"] },
        { name: "Pavo Sandwich", variants: U(120), groups: ["acomp"] },
        { name: "Avocado Sandwich", variants: U(140), groups: ["acomp"] },
        { name: "Salmon Sandwich", variants: U(190), groups: ["acomp"] },
        { name: "Omelette Sandwich", variants: U(150), groups: ["acomp", "extras"] },
        { name: "Avocado Toast", variants: U(120), groups: ["avoExtra"] },
      ],
    },
    {
      name: "Paninis",
      dishes: [
        { name: "Pesto Panini", variants: U(180), groups: ["acomp"] },
        { name: "Buffalo Panini", variants: U(160), groups: ["acomp"] },
      ],
    },
    {
      name: "Ensaladas y Bowls",
      dishes: [
        { name: "Protein Garden", variants: [{ label: "Salmón", price: 210 }, { label: "Pollo", price: 170 }, { label: "Garbanzos", price: 170 }], groups: ["extras"] },
        { name: "Pollo Buffalo", variants: U(160), groups: ["extras"] },
        { name: "Santa Fé", variants: U(160), groups: ["extras"] },
        { name: "Rollitos César", variants: U(130), groups: ["extras"] },
      ],
    },
    {
      name: "A la Plancha",
      dishes: [{ name: "A la Plancha", variants: [{ label: "Salmón", price: 250 }, { label: "Pollo", price: 180 }], groups: ["extras"] }],
    },
    {
      name: "Enchiladas y Tacos",
      dishes: [
        { name: "Enchiladas Suizas", variants: U(160), groups: ["extras"] },
        { name: "Entomatadas", variants: U(160), groups: ["entomRelleno", "extras"] },
        { name: "Tacos", variants: U(120), groups: ["tacoGuisado", "extras"] },
      ],
    },
    {
      name: "Postres",
      dishes: [
        { name: "Paradise Toast", variants: U(110), groups: ["spreadParadise"] },
        { name: "Apple Honey Toast", variants: U(120), groups: ["crema"] },
        { name: "Chocolate Panini", variants: U(130) },
        { name: "Canela Twist", variants: U(60) },
        { name: "Galletas de Almendra", variants: U(60) },
        { name: "Galletas de Avena", variants: U(50) },
      ],
    },
    {
      name: "Licuados y Smoothies",
      dishes: [
        { name: "Berry Bloom", variants: VL(100, 160), groups: ["leche", "crema", "proteina"] },
        { name: "Chocomoka", variants: VL(100, 160), groups: ["leche", "proteina"] },
        { name: "Supergreen", variants: VL(120, 180), groups: ["proteina"] },
        { name: "Licuado Personalizado", variants: VL(80, 120), groups: ["persFrutas", "persBase", "persGrasa", "persExtras"] },
      ],
    },
    {
      name: "Bebidas",
      dishes: [
        { name: "Café Americano", variants: U(40) },
        { name: "Café Americano Refill", variants: U(70) },
        { name: "Agua Embotellada", variants: U(30) },
        { name: "Agua Mineral", variants: U(40) },
        { name: "Suero Mineral", variants: U(40) },
        { name: "CocaCola", variants: U(40), groups: ["coca"] },
        { name: "Agua del Día", variants: VL(50, 80) },
        { name: "Jugo de Naranja", variants: VL(70, 100) },
        { name: "Jugo Verde", variants: VL(70, 100) },
        { name: "Jugo Zanahoria y Betabel", variants: VL(80, 120) },
      ],
    },
  ],
};
