(function (root) {
  'use strict';
  // Local, explainable keyword grouping. This does not verify a company's industry.
  const groups = [
    {industry:'IT · 소프트웨어',terms:['소프트웨어','인공지능','머신러닝','데이터분석','데이터 분석','클라우드','정보기술','정보통신','시스템개발','시스템 개발','웹개발','웹 개발','앱개발','앱 개발','개발자','프로그래머','사이버보안','정보보안','핀테크','블록체인','software','developer','cloud','artificial intelligence','machine learning','cybersecurity','AI','IT','SaaS'],synonyms:['IT','아이티','기술','테크','개발','AI','인공지능','컴퓨터','전산','소프트웨어','프로그램']},
    {industry:'부동산 · 건설',terms:['부동산','공인중개사','공인중개','중개법인','건설','건축','인테리어','시행사','시공사','도시개발','주택개발','주택 개발','리모델링','real estate','realtor','construction','architecture'],synonyms:['부동산','건설','건축','중개','중개사','인테리어','시공','분양','주택']},
    {industry:'금융 · 투자',terms:['금융','은행','증권','자산운용','자산 운용','투자자문','투자 자문','투자사','벤처캐피탈','보험','투자조합','투자 조합','캐피탈','investment','finance','financial','bank','insurance','venture capital'],synonyms:['금융','투자','펀드','은행','증권','보험','자금','VC','캐피탈']},
    {industry:'법률 · 세무 · 회계',terms:['변호사','법무법인','법무 법인','법률','법무사','세무사','세무법인','세무 법인','세무회계','회계사','회계법인','회계 법인','특허법인','특허 법인','변리사','노무사','노무법인','attorney','lawyer','law firm','accountant','accounting','tax advisor'],synonyms:['법률','법무','법무사','변호사','세금','세무','세무사','회계','회계사','특허','변리사','노무']},
    {industry:'제조 · 산업',terms:['제조','제작소','정밀','금속','기계','반도체','자동차부품','자동차 부품','전자부품','전자 부품','산업기기','공작','금형','소재','공장','manufacturing','semiconductor','machinery','industrial','precision'],synonyms:['제조','공장','생산','기계','반도체','산업','부품','소재']},
    {industry:'유통 · 무역',terms:['유통','무역','수출','수입업','수입사','도소매','도매','소매','쇼핑몰','온라인판매','온라인 판매','이커머스','전자상거래','retail','wholesale','trading','commerce','export','import'],synonyms:['유통','무역','수출','수입','도매','소매','판매','쇼핑','이커머스']},
    {industry:'물류 · 운송',terms:['물류','운송','운수','해운','항공화물','항공 화물','포워딩','택배','통관','관세사','배송','logistics','shipping','freight','transport','forwarding'],synonyms:['물류','운송','배송','해운','화물','택배','통관','관세']},
    {industry:'의료 · 바이오',terms:['병원','의원','한의원','약국','의사','치과','의료','제약','바이오','의료기기','헬스케어','재활','medical','healthcare','hospital','clinic','pharmaceutical','biotech'],synonyms:['의료','병원','건강','바이오','제약','약','의사','치과','헬스케어']},
    {industry:'교육 · 연구',terms:['교육','학원','대학교','대학원','교수','연구소','연구원','학습','에듀','직업훈련','직업 훈련','education','university','professor','academy','research'],synonyms:['교육','연구','학습','강의','강사','학교','학원','대학','에듀']},
    {industry:'마케팅 · 미디어',terms:['마케팅','광고','홍보','브랜딩','디자인','콘텐츠','컨텐츠','미디어','영상','방송','출판','엔터테인먼트','사진작가','marketing','advertising','branding','design','media','entertainment','content studio'],synonyms:['마케팅','광고','홍보','디자인','콘텐츠','영상','미디어','브랜드','방송','출판']},
    {industry:'식품 · 외식',terms:['식품','외식','레스토랑','식당','카페','커피','베이커리','프랜차이즈','케이터링','푸드','음식','restaurant','food','cafe','coffee','bakery','catering'],synonyms:['식품','음식','외식','식당','레스토랑','카페','커피','푸드','요식업']},
    {industry:'여행 · 숙박',terms:['여행','관광','호텔','리조트','숙박','투어','여행사','tourism','travel','hotel','resort','hospitality'],synonyms:['여행','관광','호텔','숙박','리조트','투어']},
    {industry:'에너지 · 환경',terms:['에너지','태양광','신재생','재생에너지','환경','재활용','폐기물','수처리','전력','배터리','energy','solar','renewable','recycling','environmental'],synonyms:['에너지','환경','전력','태양광','재활용','친환경','배터리']},
    {industry:'농업 · 수산',terms:['농업','농산','영농','농장','농업법인','농업 법인','축산','양계','수산','어업','스마트팜','임업','agriculture','farming','fishery','livestock'],synonyms:['농업','농산','농장','축산','양계','수산','어업','스마트팜']}
  ];
  const publicMail = new Set(['gmail.com','googlemail.com','naver.com','hanmail.net','daum.net','kakao.com','nate.com','hotmail.com','outlook.com','live.com','icloud.com','me.com','mac.com','yahoo.com','yahoo.co.kr','yahoo.co.jp','aol.com','proton.me','protonmail.com','qq.com','163.com','126.com','example.com','example.org','example.net']);
  const fields = ['name','company','title','phone','email','memo'];
  const text = value => String(value == null ? '' : value).normalize('NFKC').toLowerCase();
  const compact = value => text(value).replace(/[\s·&.,_\-()[\]㈜]/g,'');
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function contains(haystack, needle) {
    const term = text(needle);
    // Latin keywords must not match within unrelated words (hospital / hospitality).
    if (/^[a-z][a-z\s]*$/.test(term)) return new RegExp('(^|[^a-z0-9])'+escape(term)+'([^a-z0-9]|$)','i').test(haystack);
    return haystack.includes(term);
  }
  function analyze(card) {
    const company = text(card && card.company);
    const title = text(card && card.title);
    const memo = text(card && card.memo);
    const ranked = groups.map(group => {
      const found = group.terms.filter(term => contains(company,term)||contains(title,term)||contains(memo,term));
      const score = found.reduce((n,term) => n + (contains(company,term)?3:contains(title,term)?2:1),0);
      return {group,found,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if (!ranked.length) return {industry:'',tags:[],evidence:[],sourceLabel:'분류 정보 없음'};
    const chosen=ranked[0];
    // Equal evidence for different industries is shown as multiple tentative tags.
    const tags=ranked.slice(0,3).map(x=>x.group.industry);
    return {industry:chosen.group.industry,tags,evidence:chosen.found.slice(0,5),sourceLabel:'명함 내용 기반 추정'};
  }
  function search(card, query) {
    const raw = text(query).trim();
    if (!raw) return true;
    const values = fields.map(field=>text(card && card[field]));
    const joined = values.join(' ');
    const acronyms=new Set(['it','ai','vc']);
    const literalMatch=(value,term)=>acronyms.has(term)?contains(value,term):(value.includes(term)||compact(value).includes(compact(term)));
    if (values.some(value=>literalMatch(value,raw))) return true;
    const analysis=analyze(card);
    const tokens=raw.split(/\s+/).filter(Boolean).filter(word=>!['찾아줘','찾기','관련','전문가','사람','담당자','업종','회사','쪽'].includes(word));
    if(!tokens.length) return joined.includes(raw);
    return tokens.every(token=>{
      if(literalMatch(joined,token))return true;
      if(analysis.tags.some(tag=>text(tag).includes(token)))return true;
      return groups.some(group => group.synonyms.some(word=>text(word)===token) && analysis.tags.includes(group.industry));
    });
  }
  function organization(card) {
    const name=text(card && card.company).replace(/주식회사|유한회사|\(주\)|㈜/g,'').replace(/\b(?:corporation|company|incorporated|limited|ltd|corp|inc)\b\.?/g,'');
    return compact(name);
  }
  function domain(card) {
    const email=text(card && card.email).trim();
    const match=email.match(/^[^\s@]+@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,})$/);
    const value=match?match[1]:'';
    return value&&!publicMail.has(value)?value:'';
  }
  function related(card, records) {
    const a=analyze(card), org=organization(card), mailDomain=domain(card);
    return (Array.isArray(records)?records:[]).filter(other=>other && other!==card && (!card.id||other.id!==card.id)).map(other=>{
      const b=analyze(other);let score=0;const reasons=[];
      if(org.length>=2&&organization(other)===org){score+=100;reasons.push('같은 회사명');}
      if(mailDomain&&domain(other)===mailDomain){score+=60;reasons.push('같은 회사 이메일 도메인');}
      if(a.industry&&a.industry===b.industry){score+=20;reasons.push(a.industry+' 분야로 추정');}
      else if(a.tags.some(tag=>b.tags.includes(tag))){score+=8;reasons.push('관련 업종으로 추정');}
      return {card:other,reason:reasons.join(' · '),score};
    }).filter(x=>x.score>0).sort((x,y)=>y.score-x.score || text(x.card.name).localeCompare(text(y.card.name),'ko')).slice(0,4);
  }
  function companyLinks(card) {
    const company=String(card && card.company || '').trim();
    if(!company)return [];
    return [
      {label:'네이버 회사 조회',url:'https://search.naver.com/search.naver?query='+encodeURIComponent(company+' 회사 업종')},
      {label:'Google 회사 조회',url:'https://www.google.com/search?q='+encodeURIComponent(company+' 회사 업종')}
    ];
  }
  const api={analyze,search,related,companyLinks,industries:()=>groups.map(group=>group.industry)};
  root.NAMDA_SEMANTIC=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
