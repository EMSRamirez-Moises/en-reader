import test from 'node:test';
import assert from 'node:assert/strict';
import {hasConnections,normalize,validateAnalysis} from '../public/js/analysis.js';
import {connectionSample,preparedAnalysisFor} from '../public/js/connection-examples.js';

test('las muestras conservan el original y vinculan duración y motivo a la estancia',()=>{
  for(const paragraph of connectionSample.paragraphs){
    const analysis=preparedAnalysisFor(paragraph.text);
    assert.equal(validateAnalysis(analysis,paragraph.text,{requireConnections:true}),analysis);
    assert.equal(normalize(analysis.fragments.map(f=>f.en).join(' ')),normalize(paragraph.text));
  }
  const teacher=preparedAnalysisFor(connectionSample.paragraphs[0].text);
  assert.equal(teacher.fragments[3].connectsTo,2);
  assert.equal(teacher.fragments[4].connectsTo,2);
  assert.equal(teacher.fragments[2].connectsTo,1);
  assert.match(teacher.fragments[3].connection,/cuánto duró/);
  assert.match(teacher.fragments[4].connection,/motivo/);
  assert.equal(teacher.fragments[0].connectsTo,1,'Puede enlazar un grupo posterior sin generar un ciclo');
});

test('la ayuda preparada solo se aplica a coincidencias completas, no interpreta textos nuevos',()=>{
  const text=connectionSample.paragraphs[0].text;
  assert.ok(preparedAnalysisFor(text.replaceAll(' ','\n  ')));
  assert.equal(preparedAnalysisFor(text.replace('three','four')),null);
  assert.equal(preparedAnalysisFor(text+' She left.'),null);
  assert.equal(preparedAnalysisFor('She was about to leave when he showed up.').fragments.length,2);
});

test('los análisis antiguos siguen legibles y las respuestas nuevas exigen conexiones completas',()=>{
  const old={meaning:'Ella esperó.',fragments:[{en:'She waited.',phonetic:'shi uéitid',es:'Ella esperó.',hint:'Espera.',note:''}]};
  assert.equal(validateAnalysis(old,'She waited.'),old);
  assert.equal(hasConnections(old),false);
  assert.throws(()=>validateAnalysis(old,'She waited.',{requireConnections:true}),/conectan/);
  const incomplete={...old,scene:'Ella esperaba.'};
  assert.throws(()=>validateAnalysis(incomplete,'She waited.'),/conectan/);
});

test('rechaza relaciones circulares, al propio grupo y fuera del pasaje',()=>{
  const original=connectionSample.paragraphs[0].text;
  const source=preparedAnalysisFor(original);
  for(const target of [3,99,-2]){
    const broken=structuredClone(source);broken.fragments[3].connectsTo=target;
    assert.throws(()=>validateAnalysis(broken,original),/conexión inválida/);
  }
  const cycle=structuredClone(source);cycle.fragments[1].connectsTo=2;
  assert.throws(()=>validateAnalysis(cycle,original),/circulares/);
  const empty=structuredClone(source);empty.fragments[0].connection='';
  assert.throws(()=>validateAnalysis(empty,original),/conexión inválida/);
});
