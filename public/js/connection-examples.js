import {normalize} from './analysis.js?v=connections-20261004';

// Prepared, explicit examples: no claim of automatic semantic parsing without an AI backend.
const teacher={
  meaning:'Es cierto que una maestra había llegado de algún lugar y había vivido en el rancho durante tres años por motivos de salud.',
  scene:'Una maestra había llegado de otro lugar. Esa misma maestra había vivido en el rancho. Su estancia duró tres años. El motivo de esa estancia estaba relacionado con su salud. El narrador admite que esto había ocurrido; el matiz de «True» depende de lo anterior.',
  fragments:[
    {en:'True,',phonetic:'trú,',es:'Es cierto que…',hint:'El narrador admite lo que va a contar.',note:'El matiz depende del párrafo anterior.',adds:'El narrador admite un hecho',connectsTo:1,connection:'Introduce el hecho que viene después: el narrador admite que una maestra había llegado y se había quedado.'},
    {en:'a schoolteacher had come from somewhere',phonetic:'a skúl tícher jad kam fram sámuer',es:'una maestra había llegado de algún lugar',hint:'Piensa en una maestra que llega desde otro lugar.',note:'«Her» permite identificar a la maestra como el referente femenino.',adds:'La persona y su primera acción',connectsTo:-1,connection:'Presenta a la maestra y cuenta que había llegado de otro lugar. Los siguientes grupos siguen hablando de esta misma persona.'},
    {en:'and lived at the rancho',phonetic:'and livd at da ránchou',es:'y había vivido en el rancho',hint:'La misma maestra realiza otra acción.',note:'El «had» anterior acompaña también a «lived»: había llegado y había vivido.',adds:'Otra acción de la misma maestra',connectsTo:1,connection:'«And» une dos acciones de la misma maestra: había llegado y también había vivido en el rancho. El «had» del grupo anterior se comparte con «lived».'},
    {en:'for three years',phonetic:'fer zrí yírs',es:'durante tres años',hint:'¿Cuánto duró su estancia?',note:'Aquí «for» introduce una duración.',adds:'Duración de la estancia',connectsTo:2,connection:'Se une a «lived at the rancho»: la maestra había vivido allí durante tres años. Este grupo indica cuánto duró la estancia.'},
    {en:'for her health.',phonetic:'fer jer jelz.',es:'por motivos de salud.',hint:'¿Qué motivo tenía esa estancia?',note:'No especifica una enfermedad ni un diagnóstico.',adds:'Motivo de la estancia',connectsTo:2,connection:'También se une a «lived at the rancho». Explica el motivo de quedarse allí: su salud. Este «for» aporta un motivo; «for three years» aportaba una duración.'}
  ]
};
const arrival={
  meaning:'Ella estaba a punto de irse cuando él apareció.',
  scene:'Ella estaba a punto de irse. En ese momento él apareció. La oración conecta lo que ella se preparaba para hacer con la llegada de él; no dice si ella terminó yéndose.',
  fragments:[
    {en:'She was about to leave',phonetic:'shi uaz abáut ta lív',es:'Ella estaba a punto de irse',hint:'Está muy cerca de realizar una acción.',note:'«Was about to leave» expresa estar a punto de irse.',adds:'Lo que ella estaba por hacer',connectsTo:-1,connection:'Presenta a ella y la acción que estaba a punto de realizar. El siguiente grupo sitúa la llegada de él en ese momento.'},
    {en:'when he showed up.',phonetic:'uen ji shóud ap.',es:'cuando él apareció.',hint:'Otra persona llega en ese momento.',note:'«Showed up» funciona como una expresión completa: apareció o llegó.',adds:'Lo que ocurrió en ese momento',connectsTo:0,connection:'«When» une su llegada con el momento en que ella estaba a punto de irse. «Showed up» se entiende junto: él apareció; no describe mostrar un objeto.'}
  ]
};
const prepared=[teacher,arrival];
export function preparedAnalysisFor(text){const key=normalize(text);return prepared.find(a=>normalize(a.fragments.map(f=>f.en).join(' '))===key)||null;}
export const connectionSample={id:'prepared-connections-v1',title:'Cómo se conectan las ideas',author:'Muestra preparada · sin consumo de IA',preparedDemo:true,chapters:[{title:'Una misma estancia: duración y motivo',start:0},{title:'Dos acciones en un mismo momento',start:1}],paragraphs:prepared.map((a,i)=>({text:a.fragments.map(f=>f.en).join(' '),chapter:i})),createdAt:0};
