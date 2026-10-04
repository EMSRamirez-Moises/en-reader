const fragments = [
  [
    ['There was a sound of music.','der uaz a sáund ov miúzik','Se escuchaba música.','La escena introduce algo que se oye.','Comprende la frase completa como una imagen: música sonando.'],
    ['She stopped by the door','shi stápt bai de dor','Ella se detuvo junto a la puerta','Ella hace una pausa cerca de una entrada.','En este contexto se detiene junto a la puerta.'],
    ['and listened for a moment.','an lísend fer a móument','y escuchó un momento.','La misma persona presta atención a lo que oye.','La acción continúa: se detiene y escucha.']
  ],
  [
    ['On the other side of the door,','an di áder sáid ov de dor','Al otro lado de la puerta,','La narración te sitúa en un lugar.','Mantén junta toda la ubicación.'],
    ['someone was playing the piano.','sámuan uaz pléiin de piáno','alguien estaba tocando el piano.','Ahora descubres de dónde viene la música.','La acción estaba ocurriendo en ese momento.'],
    ['She decided to wait.','shi disáidid ta uéit','Ella decidió esperar.','La escena termina con una decisión.','Lee juntas la decisión y la acción elegida.']
  ],
  [
    ['After a while,','áfter a uáil','Después de un rato,','Ha pasado algo de tiempo.','La expresión completa sitúa el siguiente acontecimiento.'],
    ['the music stopped.','de miúzik stápt','la música dejó de sonar.','Lo que estaba escuchando cambia.','La narración avanza de forma sencilla.'],
    ['She took a deep breath','shi tuk a diip breth','Ella respiró hondo','Se prepara antes de actuar.','“Took a deep breath” es una acción completa: respirar hondo.'],
    ['and knocked on the door.','an nokt an de dor','y tocó la puerta.','Ahora anuncia su presencia.','Se refiere a golpear suavemente la puerta para que le abran.']
  ]
];
export const demo = {
  id:'demo-door-v1',title:'Al otro lado de la puerta',author:'Relato de muestra · texto original',demo:true,
  chapters:[{title:'Una pausa en el camino',start:0}],
  paragraphs:fragments.map(parts=>({text:parts.map(p=>p[0]).join(' '),chapter:0})),
  createdAt:0
};
export const demoAnalysis=fragments.map(parts=>({meaning:parts.map(p=>p[2]).join(' '),fragments:parts.map(p=>Object.fromEntries(['en','phonetic','es','hint','note'].map((key,i)=>[key,p[i]])))}));
