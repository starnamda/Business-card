import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signInWithRedirect,getRedirectResult,signOut,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,setDoc,deleteDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const cfg=window.NAMDA_FIREBASE_CONFIG;
const emit=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}));
if(!cfg||!cfg.apiKey||!cfg.authDomain||!cfg.projectId||!cfg.appId){
  emit('namda-auth-unavailable',{reason:'Firebase Google 로그인 연결이 아직 설정되지 않았습니다.'});
}else{
  try{
    const app=initializeApp(cfg);
    const auth=getAuth(app);
    const db=getFirestore(app);
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    let unsubscribeCards=null;
    let currentUser=null;
    window.NAMDA_AUTH={
      available:true,
      async signIn(){
        await setPersistence(auth,browserLocalPersistence);
        try {
          if(/Android|iPad|iPhone|iPod/i.test(navigator.userAgent)){
            await signInWithRedirect(auth,provider);
          }else{
            await signInWithPopup(auth,provider);
          }
        }catch(err){
          if(err.code==='auth/popup-blocked'||err.code==='auth/popup-closed-by-user'){
            if(err.code==='auth/popup-blocked')await signInWithRedirect(auth,provider);
            else throw err;
          }else throw err;
        }
      },
      async signOut(){await signOut(auth);},
      async putCard(item){
        if(!currentUser)throw new Error('Google 로그인이 필요합니다.');
        await setDoc(doc(db,'users',currentUser.uid,'cards',item.id),item);
      },
      async removeCard(id){
        if(!currentUser)throw new Error('Google 로그인이 필요합니다.');
        await deleteDoc(doc(db,'users',currentUser.uid,'cards',id));
      }
    };
    const ready=getRedirectResult(auth).catch(err=>{emit('namda-auth-error',{message:err.message});});
    onAuthStateChanged(auth,async user=>{
      await ready;
      if(unsubscribeCards){unsubscribeCards();unsubscribeCards=null;}
      currentUser=user;
      if(!user){emit('namda-auth-state',{user:null});return;}
      emit('namda-auth-state',{user:{uid:user.uid,email:user.email,displayName:user.displayName}});
      unsubscribeCards=onSnapshot(collection(db,'users',user.uid,'cards'),snapshot=>{
        emit('namda-cloud-cards',{cards:snapshot.docs.map(d=>d.data())});
      },error=>emit('namda-auth-error',{message:'명함 동기화 실패: '+error.message}));
    },error=>emit('namda-auth-error',{message:error.message}));
  }catch(error){emit('namda-auth-unavailable',{reason:error.message});}
}
