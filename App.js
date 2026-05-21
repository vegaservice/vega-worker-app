// ████ VEGA WORKER APP v2.0 ████
// For VEGA Professionals — Android + iOS
// 🚫 CRITICAL RULE: NEVER show job amount / price / earnings to worker
// Workers are salaried employees — not gig workers
// April 2026 — VEGA Home Services, Visakhapatnam

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, Alert, SafeAreaView, Dimensions,
  Animated, Modal, ActivityIndicator, RefreshControl,
  Linking, Platform, Switch,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';
import storage from '@react-native-firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

const { width: W } = Dimensions.get('window');

const C = {
  bg:'#06100A', card:'#0A1A0E', card2:'#0E2014',
  green:'#22C55E', green2:'#16A34A', greenBg:'#081A0C', greenBd:'#1A4020',
  orange:'#E8520A', orangeBg:'#1A0A04', orangeBd:'#3A1A04',
  gold:'#D4901A', goldBg:'#1A1004',
  red:'#EF4444', redBg:'#1A0404', redBd:'#4A1010',
  blue:'#3B82F6', blueBg:'#04081A', blueBd:'#1A2A5A',
  purple:'#A855F7', purpleBg:'#12082A',
  text:'#EDF5EF', text2:'#A8C8B0', muted:'#587060',
  border:'#0E200A', border2:'#1A3018',
};

const SHADOW = {
  card:{ shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.4,shadowRadius:8,elevation:4 },
  glow:{ shadowColor:C.green,shadowOffset:{width:0,height:0},shadowOpacity:0.4,shadowRadius:12,elevation:6 },
};

const timeAgo=(ts)=>{
  if(!ts) return '';
  const d=ts.toDate?ts.toDate():new Date(ts);
  const diff=Math.floor((Date.now()-d.getTime())/1000);
  if(diff<60) return `${diff}s ago`;
  if(diff<3600) return `${Math.floor(diff/60)}m ago`;
  if(diff<86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString('en-IN');
};

const fmtTime=(ts)=>{
  if(!ts) return '--';
  const d=ts.toDate?ts.toDate():new Date(ts);
  return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
};

const calcDelay=(from)=>{
  if(!from) return 0;
  const a=from.toDate?from.toDate():new Date(from);
  return Math.floor((Date.now()-a.getTime())/60000);
};

const fbUpdate=async(col,id,data)=>{
  try{ await firestore().collection(col).doc(id).update({...data,updatedAt:firestore.FieldValue.serverTimestamp()}); return true; }
  catch(e){ console.error('fbUpdate:',e); return false; }
};

export default function App() {
  const [screen,setScreen]=useState('splash');
  const [tab,setTab]=useState('today');
  const [phone,setPhone]=useState('');
  const [otpVal,setOtpVal]=useState('');
  const [confirm,setConfirm]=useState(null);
  const [loading,setLoading]=useState(false);
  const [worker,setWorker]=useState(null);
  const [myJobs,setMyJobs]=useState([]);
  const [selJob,setSelJob]=useState(null);
  const [otpInput,setOtpInput]=useState('');
  const [otpAttempts,setOtpAttempts]=useState(0);
  const [refreshing,setRefreshing]=useState(false);
  const [isAvailable,setIsAvailable]=useState(true);
  const [rejectModal,setRejectModal]=useState(false);
  const [rejectReason,setRejectReason]=useState('');
  const [rejectOther,setRejectOther]=useState('');
  const [photoPhase,setPhotoPhase]=useState('before');
  const [photoModal,setPhotoModal]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [phoneError,setPhoneError]=useState('');
  const [otpError,setOtpError]=useState('');

  const fadeAnim=useRef(new Animated.Value(0)).current;

  useEffect(()=>{
    Animated.timing(fadeAnim,{toValue:1,duration:1200,useNativeDriver:true}).start();
    // ── Session Restore: don't ask OTP on every open ──────────
    const unsubAuth=auth().onAuthStateChanged(async(fUser)=>{
      if(fUser){
        try{
          const ph=fUser.phoneNumber?.replace('+91','');
          const snap=await firestore().collection('workers').where('phone','==',ph).limit(1).get();
          if(!snap.empty){
            const wData={id:snap.docs[0].id,...snap.docs[0].data()};
            if(wData.status==='active'||wData.status==='inactive'){
              setWorker(wData);setIsAvailable(wData.isAvailable!==false);
              await registerFCM(wData.id);
              setScreen('main');return;
            }
          }
        }catch(e){console.log('session restore:',e);}
      }
      setScreen('login');
    });
    return()=>unsubAuth();
  },[]);

  // FCM setup
  const registerFCM=async(workerId)=>{
    try{
      const authStatus=await messaging().requestPermission();
      const token=await messaging().getToken();
      if(token) await fbUpdate('workers',workerId,{fcmToken:token});
    }catch(e){console.log('FCM:',e);}
  };

  // Live GPS location ping every 30s — saved to Firestore for Admin map + route playback
  useEffect(()=>{
    if(!worker) return;
    let intervalId=null;
    (async()=>{
      const {status}=await Location.requestForegroundPermissionsAsync();
      intervalId=setInterval(async()=>{
        try{
          if(status==='granted'){
            const loc=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
            const lat=loc.coords.latitude;
            const lng=loc.coords.longitude;
            const now=firestore.FieldValue.serverTimestamp();
            // Update current location on worker doc
            await fbUpdate('workers',worker.id,{
              lastLat:lat, lastLng:lng,
              lastLocationAt:now,
              lastLocation:{lat,lng},  // also in new format for Admin map
              locationUpdatedAt:now,
            });
            // Write to trail subcollection for route playback
            const today=new Date();
            const dayKey=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
            await firestore()
              .collection('workers').doc(worker.id)
              .collection('location_trail')
              .add({ lat, lng, timestamp:firestore.FieldValue.serverTimestamp(), day:dayKey });
          }else{
            await fbUpdate('workers',worker.id,{lastLocationAt:firestore.FieldValue.serverTimestamp()});
          }
        }catch(e){console.log('loc update:',e);}
      },30000); // every 30 seconds
    })();
    return()=>{if(intervalId)clearInterval(intervalId);};
  },[worker]);

  // Jobs listener
  useEffect(()=>{
    if(!worker) return;
    const unsub=firestore().collection('bookings')
      .where('assignedWorkerId','==',worker.id)
      .where('status','in',['assigned','on_the_way','in_progress','completed'])
      .orderBy('createdAt','desc')
      .limit(50)
      .onSnapshot(
        snap=>setMyJobs(snap.docs.map(d=>({id:d.id,...d.data()}))),
        err=>{
          console.error('jobs listener error:',err);
          Alert.alert('Connection Issue','Showing last known data. Check your internet.');
        }
      );
    const unsubFCM=messaging().onMessage(async msg=>{
      Alert.alert(msg.notification?.title||'🪷 VEGA',msg.notification?.body||'New update');
    });
    return()=>{ unsub(); unsubFCM(); };
  },[worker]);

  // Sync selJob with live Firestore data to prevent stale state
  useEffect(()=>{
    if(!selJob) return;
    const updated=myJobs.find(j=>j.id===selJob.id);
    if(updated) setSelJob(updated);
  },[myJobs]);

  // AUTH
  const sendOTP=async()=>{
    if(!phone||phone.length<10){setPhoneError('Enter a valid 10-digit mobile number');return;}
    setPhoneError('');setLoading(true);
    try{
      const c=await auth().signInWithPhoneNumber(`+91${phone}`);
      setConfirm(c); setLoading(false); setScreen('otp');
    }catch(e){setLoading(false);setPhoneError(e.message||'Could not send OTP. Try again.');}
  };

  const verifyOTP=async()=>{
    if(!otpVal||otpVal.length<6) return;
    setOtpError('');setLoading(true);
    try{
      await confirm.confirm(otpVal);
      const snap=await firestore().collection('workers').where('phone','==',phone).limit(1).get();
      if(snap.empty){auth().signOut();setLoading(false);setOtpError('Not registered as a VEGA professional. Contact hub manager: 9441270570');return;}
      const wData={id:snap.docs[0].id,...snap.docs[0].data()};
      if(wData.status==='suspended'){auth().signOut();setLoading(false);setOtpError('Account suspended. Contact hub manager: 9441270570');return;}
      if(wData.status==='blocked'){auth().signOut();setLoading(false);setOtpError('Account blocked. Contact VEGA admin.');return;}
      setWorker(wData); setIsAvailable(wData.isAvailable!==false);
      await registerFCM(wData.id);
      setLoading(false); setScreen('main');
    }catch(e){
      setLoading(false);
      const code=e?.code||'';
      if(code.includes('invalid-verification-code')||code.includes('invalid-code')) setOtpError('Wrong OTP. Please check and try again.');
      else if(code.includes('code-expired')) setOtpError('OTP expired. Go back and request a new one.');
      else if(code.includes('session-expired')) setOtpError('Session expired. Go back and request OTP again.');
      else setOtpError(e.message||'Verification failed. Try again.');
    }
  };

  const toggleAvailability=async(val)=>{
    setIsAvailable(val);
    await fbUpdate('workers',worker.id,{isAvailable:val});
  };

  const onRefresh=async()=>{
    setRefreshing(true);
    if(worker){const f=await firestore().collection('workers').doc(worker.id).get();if(f.exists)setWorker({id:f.id,...f.data()});}
    setRefreshing(false);
  };

  // JOB ACTIONS
  const markOnTheWay=async(job)=>{
    const delay=calcDelay(job.assignedAt);
    await fbUpdate('bookings',job.id,{status:'on_the_way',onTheWayAt:firestore.FieldValue.serverTimestamp(),delayToStart:delay,delayFlag:delay>15});
    Alert.alert('✅ Updated','Customer notified you are on the way!');
  };

  const verifyJobOTP=async(job)=>{
    if(!otpInput||otpInput.length<4){Alert.alert('Enter OTP','Ask customer for 4-digit OTP');return;}
    if(otpAttempts>=3){Alert.alert('Too many attempts','Please contact your Hub Manager.');return;}
    if(otpInput!==job.otp){
      const newAttempts=otpAttempts+1;
      setOtpAttempts(newAttempts);
      const left=3-newAttempts;
      Alert.alert('Wrong OTP', left>0?`Ask the customer again. ${left} attempt${left===1?'':'s'} remaining.`:'3 wrong attempts. Contact Hub Manager.');
      return;
    }
    if(!(job.beforePhotos||[]).length){
      Alert.alert('Photos Required','Upload BEFORE photos first.');
      setPhotoPhase('before'); setPhotoModal(true); return;
    }
    const delay=calcDelay(job.onTheWayAt);
    await fbUpdate('bookings',job.id,{status:'in_progress',startedAt:firestore.FieldValue.serverTimestamp(),otpVerified:true,delayToArrive:delay,delayFlag:delay>15});
    setOtpInput('');
    setOtpAttempts(0);
    Alert.alert('🚀 Job Started!','OTP verified. Do your best! 🪷');
  };

  const markComplete=async(job)=>{
    if(!(job.afterPhotos||[]).length){
      Alert.alert('Photos Required','Upload AFTER photos first.');
      setPhotoPhase('after'); setPhotoModal(true); return;
    }
    Alert.alert('Complete Job?','Service fully done and customer satisfied?',[
      {text:'Not yet',style:'cancel'},
      {text:'Yes, Complete!',onPress:async()=>{
        await fbUpdate('bookings',job.id,{status:'completed',completedAt:firestore.FieldValue.serverTimestamp()});
        await firestore().collection('workers').doc(worker.id).update({
          totalJobsCompleted:firestore.FieldValue.increment(1),
          'attendance.jobsToday':firestore.FieldValue.increment(1),
          'attendance.jobsWeek':firestore.FieldValue.increment(1),
          isAvailable:true,
          currentJobId:null,
        });
        Alert.alert('🎉 Job Complete!','Great work! 🪷');
        setSelJob(null);
      }},
    ]);
  };

  const rejectJob=async(job)=>{
    if(!rejectReason){Alert.alert('Select a reason');return;}
    const reason=rejectReason==='Other'?rejectOther:rejectReason;
    if(!reason){Alert.alert('Describe the reason');return;}
    await fbUpdate('bookings',job.id,{status:'rejected',rejectedBy:worker.id,rejectedByName:worker.name,rejectReason:reason,rejectedAt:firestore.FieldValue.serverTimestamp(),assignedWorkerId:null});
    setRejectModal(false); setRejectReason(''); setRejectOther(''); setSelJob(null);
    Alert.alert('Job Rejected','Hub manager has been notified.');
  };

  const addPhoto=async(job,phase)=>{
    const freshJob=myJobs.find(j=>j.id===job.id)||job;
    const current=freshJob[`${phase}Photos`]||[];
    if(current.length>=5){Alert.alert('Max 5 photos','Remove one before adding more.');return;}
    const {status}=await ImagePicker.requestCameraPermissionsAsync();
    if(status!=='granted'){
      Alert.alert('Camera permission needed','Please allow camera access in Settings.');
      return;
    }
    const result=await ImagePicker.launchCameraAsync({
      mediaTypes:ImagePicker.MediaTypeOptions.Images,
      quality:0.75,allowsEditing:true,aspect:[4,3],
    });
    if(result.canceled) return;
    setUploading(true);
    try{
      const uri=result.assets[0].uri;
      const filename=`bookings/${job.id}/${phase}/${Date.now()}.jpg`;
      const ref=storage().ref(filename);
      await ref.putFile(uri);
      const url=await ref.getDownloadURL();
      await fbUpdate('bookings',job.id,{[`${phase}Photos`]:[...current,url]});
      setSelJob(prev=>prev?{...prev,[`${phase}Photos`]:[...current,url]}:prev);
      setUploading(false);
      Alert.alert('✅ Photo Added','Photo saved successfully.');
    }catch(e){
      setUploading(false);
      Alert.alert('Upload failed',e.message||'Could not upload photo. Check internet connection.');
    }
  };

  // Computed — use scheduledDate for today filter, not createdAt
  const todayStr=new Date().toISOString().split('T')[0];
  const todayJobs=myJobs.filter(j=>{
    if(j.bookingMode==='instant') return true; // instant bookings always show as today
    if(j.scheduledDate) return j.scheduledDate===todayStr;
    // fallback: created today
    const d=j.createdAt?.toDate?j.createdAt.toDate():new Date(j.createdAt||0);
    return d.toISOString().split('T')[0]===todayStr;
  });
  const activeJobs=myJobs.filter(j=>['assigned','on_the_way','in_progress'].includes(j.status));
  const completedJobs=myJobs.filter(j=>j.status==='completed');

  // SPLASH
  if(screen==='splash') return(
    <View style={{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center'}}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <Animated.View style={{opacity:fadeAnim,alignItems:'center'}}>
        <Text style={{fontSize:60}}>🪷</Text>
        <Text style={{fontSize:34,fontWeight:'900',color:C.green,letterSpacing:6,marginTop:12}}>VEGA</Text>
        <Text style={{fontSize:14,color:C.text2,marginTop:8,letterSpacing:2}}>PROFESSIONAL APP</Text>
        <View style={{width:40,height:2,backgroundColor:C.green,borderRadius:1,marginTop:16}}/>
        <Text style={{fontSize:11,color:C.muted,marginTop:12}}>Visakhapatnam · Home Services</Text>
      </Animated.View>
    </View>
  );

  // LOGIN
  if(screen==='login') return(
    <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={{flex:1,padding:24,justifyContent:'center'}}>
        <Text style={{fontSize:32}}>🪷</Text>
        <Text style={{fontSize:28,fontWeight:'900',color:C.green,marginTop:12}}>Welcome!</Text>
        <Text style={{fontSize:14,color:C.text2,marginTop:6,marginBottom:40}}>VEGA Professional Login</Text>
        <Text style={S.lbl}>Your Mobile Number</Text>
        <View style={S.phoneRow}>
          <Text style={S.flag}>🇮🇳 +91</Text>
          <TextInput style={S.phoneInp} placeholder="Enter your number" placeholderTextColor={C.muted}
            keyboardType="number-pad" maxLength={10} value={phone} onChangeText={setPhone} color={C.text}/>
        </View>
        {phoneError?<Text style={{color:C.red,fontSize:13,marginTop:8,marginBottom:4}}>{phoneError}</Text>:null}
        <TouchableOpacity style={[S.btn,phone.length<10&&{opacity:0.4},{marginTop:16}]} disabled={phone.length<10||loading} onPress={sendOTP}>
          {loading?<ActivityIndicator color="#FFF"/>:<Text style={S.btnT}>Send OTP →</Text>}
        </TouchableOpacity>
        <View style={{marginTop:28,backgroundColor:C.greenBg,borderRadius:14,padding:14,borderWidth:0.5,borderColor:C.greenBd}}>
          <Text style={{color:C.green,fontWeight:'700',fontSize:13}}>🔒 Registered professionals only</Text>
          <Text style={{color:C.text2,fontSize:12,marginTop:4}}>Contact hub manager if you cannot login.</Text>
        </View>
      </View>
    </SafeAreaView>
  );

  // OTP
  if(screen==='otp') return(
    <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
      <View style={{flex:1,padding:24,justifyContent:'center'}}>
        <TouchableOpacity onPress={()=>setScreen('login')} style={{marginBottom:32}}>
          <Text style={{color:C.green,fontSize:16}}>← Back</Text>
        </TouchableOpacity>
        <Text style={{fontSize:24,fontWeight:'900',color:C.text}}>Enter OTP</Text>
        <Text style={{fontSize:13,color:C.muted,marginTop:4,marginBottom:28}}>Sent to +91 {phone}</Text>
        <TextInput style={[S.inp,{fontSize:32,fontWeight:'900',letterSpacing:16,textAlign:'center',paddingVertical:20}]}
          placeholder="——————" placeholderTextColor={C.border2} keyboardType="number-pad" maxLength={6}
          value={otpVal} onChangeText={setOtpVal} color={C.text}/>
        {otpError?<Text style={{color:C.red,fontSize:13,marginTop:8,marginBottom:4,lineHeight:18}}>{otpError}</Text>:null}
        <TouchableOpacity style={[S.btn,otpVal.length<6&&{opacity:0.4},{marginTop:16}]} disabled={otpVal.length<6||loading} onPress={verifyOTP}>
          {loading?<ActivityIndicator color="#FFF"/>:<Text style={S.btnT}>Verify & Login →</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // PHOTO MODAL
  const PhotoModal=()=>{
    if(!selJob||!photoModal) return null;
    const photos=selJob[`${photoPhase}Photos`]||[];
    return(
      <Modal visible={photoModal} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
            <TouchableOpacity onPress={()=>setPhotoModal(false)}><Text style={{color:C.green,fontSize:16}}>← Back</Text></TouchableOpacity>
            <Text style={{color:C.text,fontWeight:'700',fontSize:16}}>{photoPhase==='before'?'Before Photos':'After Photos'}</Text>
            <View style={{width:60}}/>
          </View>
          <ScrollView style={{padding:16}}>
            <View style={{backgroundColor:photoPhase==='before'?C.orangeBg:C.greenBg,borderRadius:14,padding:14,marginBottom:20,borderWidth:0.5,borderColor:photoPhase==='before'?C.orangeBd:C.greenBd}}>
              <Text style={{color:photoPhase==='before'?C.orange:C.green,fontWeight:'700',fontSize:14}}>
                {photoPhase==='before'?'📸 Take photos BEFORE starting work':'📸 Take photos AFTER completing work'}
              </Text>
              <Text style={{color:C.text2,fontSize:12,marginTop:4}}>Min 1 photo · Max 5 photos</Text>
            </View>
            {photos.map((url,i)=>(
              <View key={i} style={{backgroundColor:C.card,borderRadius:14,padding:14,marginBottom:10,borderWidth:0.5,borderColor:C.border2,flexDirection:'row',alignItems:'center',gap:12}}>
                <Text style={{fontSize:28}}>🖼️</Text>
                <View style={{flex:1}}>
                  <Text style={{color:C.green,fontWeight:'700'}}>Photo {i+1} ✅ Uploaded</Text>
                  <Text style={{color:C.muted,fontSize:10,marginTop:2}} numberOfLines={1}>{url}</Text>
                </View>
              </View>
            ))}
            {photos.length<5&&(
              <TouchableOpacity style={[S.btn,{backgroundColor:photoPhase==='before'?C.orange:C.green2}]}
                onPress={()=>addPhoto(selJob,photoPhase)} disabled={uploading}>
                {uploading?<ActivityIndicator color="#FFF"/>:<Text style={S.btnT}>📷 Add Photo ({photos.length}/5)</Text>}
              </TouchableOpacity>
            )}
            {photos.length===0&&(
              <View style={{backgroundColor:C.redBg,borderRadius:12,padding:14,marginTop:12,borderWidth:0.5,borderColor:C.redBd}}>
                <Text style={{color:C.red,fontWeight:'700'}}>⚠️ At least 1 photo required</Text>
              </View>
            )}
            {photos.length>=1&&(
              <TouchableOpacity style={[S.btn,{marginTop:16,backgroundColor:C.green2}]} onPress={()=>setPhotoModal(false)}>
                <Text style={S.btnT}>✅ Done — {photos.length} photo{photos.length>1?'s':''} saved</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // REJECT MODAL
  const RejectModal=()=>(
    <Modal visible={rejectModal} animationType="slide" presentationStyle="formSheet">
      <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
          <TouchableOpacity onPress={()=>{setRejectModal(false);setRejectReason('');}}><Text style={{color:C.green}}>Cancel</Text></TouchableOpacity>
          <Text style={{color:C.text,fontWeight:'700'}}>Reject Job</Text>
          <TouchableOpacity onPress={()=>rejectJob(selJob)}><Text style={{color:C.red,fontWeight:'700'}}>Confirm</Text></TouchableOpacity>
        </View>
        <ScrollView style={{padding:16}}>
          <Text style={{color:C.text2,marginBottom:20,fontSize:14}}>Select reason. Hub manager will be notified.</Text>
          {['Too far from my location','Not available right now','Health issue','Safety concern','Other'].map(r=>(
            <TouchableOpacity key={r} onPress={()=>setRejectReason(r)}
              style={{flexDirection:'row',alignItems:'center',padding:16,borderRadius:14,marginBottom:10,
                backgroundColor:rejectReason===r?C.redBg:C.card,borderWidth:1,borderColor:rejectReason===r?C.redBd:C.border2}}>
              <View style={{width:22,height:22,borderRadius:11,borderWidth:2,alignItems:'center',justifyContent:'center',marginRight:14,borderColor:rejectReason===r?C.red:C.muted}}>
                {rejectReason===r&&<View style={{width:10,height:10,borderRadius:5,backgroundColor:C.red}}/>}
              </View>
              <Text style={{color:rejectReason===r?C.red:C.text2,fontSize:14,fontWeight:rejectReason===r?'700':'400'}}>{r}</Text>
            </TouchableOpacity>
          ))}
          {rejectReason==='Other'&&(
            <TextInput style={[S.inp,{marginTop:8,height:100,textAlignVertical:'top'}]}
              placeholder="Describe your reason..." placeholderTextColor={C.muted}
              multiline value={rejectOther} onChangeText={setRejectOther} color={C.text}/>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  // JOB DETAIL MODAL
  const JobDetailModal=()=>{
    if(!selJob) return null;
    const STAT={
      assigned:{bg:C.goldBg,text:C.gold,label:'Assigned'},
      on_the_way:{bg:C.greenBg,text:C.green,label:'On the Way'},
      in_progress:{bg:C.purpleBg,text:C.purple,label:'In Progress'},
      completed:{bg:C.greenBg,text:C.green,label:'Completed ✓'},
      rejected:{bg:C.redBg,text:C.red,label:'Rejected'},
    };
    const sc=STAT[selJob.status]||STAT.assigned;
    const before=selJob.beforePhotos||[];
    const after=selJob.afterPhotos||[];
    const canGo=selJob.status==='assigned';
    const canStart=selJob.status==='on_the_way';
    const canComplete=selJob.status==='in_progress';
    const canReject=canGo||canStart;

    return(
      <Modal visible={!!selJob} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
            <TouchableOpacity onPress={()=>{setSelJob(null);setOtpInput('');}}><Text style={{color:C.green,fontSize:16}}>← Back</Text></TouchableOpacity>
            <Text style={{color:C.text,fontWeight:'700'}}>Job Details</Text>
            <View style={{paddingHorizontal:10,paddingVertical:3,borderRadius:10,backgroundColor:sc.bg}}>
              <Text style={{color:sc.text,fontSize:11,fontWeight:'700'}}>{sc.label}</Text>
            </View>
          </View>
          <ScrollView style={{padding:16}}>

            {/* Job ID */}
            <View style={S.detailCard}>
              <View style={{flexDirection:'row',justifyContent:'space-between'}}>
                <Text style={{color:C.green,fontWeight:'800',fontSize:18}}>{selJob.orderId||selJob.id?.slice(-6)}</Text>
                <Text style={{color:C.muted,fontSize:12}}>{timeAgo(selJob.createdAt)}</Text>
              </View>
              <Text style={{color:C.text2,fontSize:13,marginTop:6}}>📅 {selJob.slot||selJob.scheduledTime||'Today'}</Text>
              <Text style={{color:C.text2,fontSize:13,marginTop:2}}>🔧 {selJob.serviceType||'Home Cleaning'}{selJob.carType?` — ${selJob.carType.charAt(0).toUpperCase()+selJob.carType.slice(1)}`:''}</Text>
              {selJob.delayFlag&&(
                <View style={{backgroundColor:C.redBg,borderRadius:10,padding:8,marginTop:10,flexDirection:'row',gap:8,borderWidth:0.5,borderColor:C.redBd}}>
                  <Text style={{color:C.red,fontSize:12}}>⚠️ Delay flagged by system</Text>
                </View>
              )}
            </View>

            {/* Customer — NO price shown */}
            <View style={S.detailCard}>
              <Text style={S.detailLabel}>👤 CUSTOMER</Text>
              <Text style={{color:C.text,fontSize:16,fontWeight:'700',marginTop:8}}>{selJob.customerName||selJob.userName||'Customer'}</Text>
              <Text style={{color:C.text2,fontSize:13,marginTop:4}}>📍 {selJob.addressFull||selJob.address?.full||'Address'}</Text>
              <View style={{flexDirection:'row',gap:10,marginTop:14}}>
                <TouchableOpacity style={[S.actionBtn,{flex:1,backgroundColor:C.greenBg,borderColor:C.greenBd}]}
                  onPress={()=>Linking.openURL(`tel:+91${selJob.userPhone||selJob.customerPhone}`)}
                  >
                  <Text style={{fontSize:16}}>📞</Text><Text style={{color:C.green,fontWeight:'700',fontSize:12}}>Call Customer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.actionBtn,{flex:1,backgroundColor:C.blueBg,borderColor:C.blueBd}]}
                  onPress={()=>{
                    const addr=selJob.addressFull||'Madhurawada Visakhapatnam';
                    Linking.openURL(Platform.OS==='ios'?`maps:0,0?q=${encodeURIComponent(addr)}`:`geo:0,0?q=${encodeURIComponent(addr)}`);
                  }}>
                  <Text style={{fontSize:16}}>🗺️</Text><Text style={{color:C.blue,fontWeight:'700',fontSize:12}}>Navigate</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Services — NO amount */}
            <View style={S.detailCard}>
              <Text style={S.detailLabel}>🛠 SERVICES TO DO</Text>
              {(selJob.items||[{name:selJob.serviceType||'Home Cleaning'}]).map((item,i)=>(
                <Text key={i} style={{color:C.text2,fontSize:14,marginTop:8}}>
                  • {item.name}{item.variant?` (${item.variant})`:''}
                  {/* ⚠️ NO price shown */}
                </Text>
              ))}
            </View>

            {/* Photos */}
            <View style={S.detailCard}>
              <Text style={S.detailLabel}>📸 PHOTO PROOF (MANDATORY)</Text>

              <TouchableOpacity style={{backgroundColor:C.orangeBg,borderRadius:12,padding:12,marginTop:12,borderWidth:0.5,borderColor:C.orangeBd,flexDirection:'row',alignItems:'center',gap:10}}
                onPress={()=>{setPhotoPhase('before');setPhotoModal(true);}}>
                <Text style={{fontSize:20}}>📷</Text>
                <View style={{flex:1}}>
                  <Text style={{color:C.orange,fontWeight:'700',fontSize:13}}>BEFORE Photos</Text>
                  <Text style={{color:before.length>0?C.green:C.red,fontSize:11,marginTop:2}}>
                    {before.length>0?`${before.length} photo${before.length>1?'s':''} uploaded ✅`:'⚠️ Required — not uploaded yet'}
                  </Text>
                </View>
                <Text style={{color:C.orange,fontSize:18}}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={{backgroundColor:C.greenBg,borderRadius:12,padding:12,marginTop:10,borderWidth:0.5,borderColor:C.greenBd,flexDirection:'row',alignItems:'center',gap:10}}
                onPress={()=>{setPhotoPhase('after');setPhotoModal(true);}}>
                <Text style={{fontSize:20}}>📷</Text>
                <View style={{flex:1}}>
                  <Text style={{color:C.green,fontWeight:'700',fontSize:13}}>AFTER Photos</Text>
                  <Text style={{color:after.length>0?C.green:C.muted,fontSize:11,marginTop:2}}>
                    {after.length>0?`${after.length} photo${after.length>1?'s':''} uploaded ✅`:'Not uploaded yet'}
                  </Text>
                </View>
                <Text style={{color:C.green,fontSize:18}}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Time Tracking */}
            <View style={S.detailCard}>
              <Text style={S.detailLabel}>⏱ TIME TRACKING</Text>
              {[
                {label:'Assigned at',val:fmtTime(selJob.assignedAt)},
                {label:'On the Way at',val:fmtTime(selJob.onTheWayAt)},
                {label:'Started at',val:fmtTime(selJob.startedAt)},
                {label:'Completed at',val:fmtTime(selJob.completedAt)},
              ].map((t,i)=>(
                <View key={i} style={{flexDirection:'row',justifyContent:'space-between',marginTop:8}}>
                  <Text style={{color:C.muted,fontSize:13}}>{t.label}</Text>
                  <Text style={{color:t.val==='--'?C.border2:C.text2,fontSize:13,fontWeight:'600'}}>{t.val}</Text>
                </View>
              ))}
            </View>

            {/* OTP Entry */}
            {canStart&&(
              <View style={[S.detailCard,{borderColor:C.greenBd,borderWidth:1.5}]}>
                <Text style={S.detailLabel}>🔐 ENTER CUSTOMER OTP TO START</Text>
                {before.length===0&&(
                  <View style={{backgroundColor:C.redBg,borderRadius:10,padding:10,marginBottom:12,borderWidth:0.5,borderColor:C.redBd}}>
                    <Text style={{color:C.red,fontSize:12,fontWeight:'700'}}>⚠️ Upload BEFORE photos first</Text>
                  </View>
                )}
                <Text style={{color:C.text2,fontSize:12,marginTop:4,marginBottom:12}}>Ask the customer for their 4-digit OTP</Text>
                <TextInput style={[S.inp,{fontSize:28,fontWeight:'900',letterSpacing:14,textAlign:'center',paddingVertical:14}]}
                  placeholder="0000" placeholderTextColor={C.border2} keyboardType="number-pad" maxLength={4}
                  value={otpInput} onChangeText={setOtpInput} color={C.text}/>
                <TouchableOpacity style={[S.btn,{marginTop:12,backgroundColor:C.green2,...SHADOW.glow}]}
                  onPress={()=>verifyJobOTP(selJob)}>
                  <Text style={S.btnT}>✅ Verify OTP & Start Service</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Actions */}
            <View style={{gap:12,marginTop:8}}>
              {canGo&&(
                <TouchableOpacity style={[S.btn,{backgroundColor:C.blue}]} onPress={()=>markOnTheWay(selJob)}>
                  <Text style={S.btnT}>🚀 I'm On My Way</Text>
                </TouchableOpacity>
              )}
              {canComplete&&(
                <TouchableOpacity style={[S.btn,{backgroundColor:C.green2,...SHADOW.glow}]} onPress={()=>markComplete(selJob)}>
                  <Text style={S.btnT}>🎉 Mark Job Complete</Text>
                </TouchableOpacity>
              )}
              {canReject&&(
                <TouchableOpacity style={[S.btn,{backgroundColor:'transparent',borderWidth:1,borderColor:C.redBd}]}
                  onPress={()=>setRejectModal(true)}>
                  <Text style={[S.btnT,{color:C.red}]}>❌ Reject This Job</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Checklist */}
            <View style={[S.detailCard,{marginTop:16}]}>
              <Text style={S.detailLabel}>✅ VEGA SERVICE CHECKLIST</Text>
              {['Show ID card before entering home','Remove shoes — use shoe bag','Greet: "Namaste! I am your VEGA professional"',
                'Take BEFORE photos before starting','Clean top-to-bottom — fan first, floor last',
                'No personal calls during service','Take AFTER photos when done','Ask customer to check before leaving'].map((item,i)=>(
                <View key={i} style={{flexDirection:'row',alignItems:'flex-start',gap:10,marginTop:10}}>
                  <View style={{width:18,height:18,borderRadius:9,backgroundColor:C.greenBg,alignItems:'center',justifyContent:'center',marginTop:1}}>
                    <Text style={{color:C.green,fontSize:9,fontWeight:'900'}}>✓</Text>
                  </View>
                  <Text style={{flex:1,color:C.text2,fontSize:12,lineHeight:18}}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={{height:40}}/>
          </ScrollView>
        </SafeAreaView>
        <PhotoModal/>
        <RejectModal/>
      </Modal>
    );
  };

  // JOB CARD
  const JobCard=({job})=>{
    const STAT={
      assigned:{bg:C.goldBg,text:C.gold,label:'Assigned'},
      on_the_way:{bg:C.greenBg,text:C.green,label:'On the Way'},
      in_progress:{bg:C.purpleBg,text:C.purple,label:'In Progress'},
      completed:{bg:C.greenBg,text:C.green,label:'Done ✓'},
      rejected:{bg:C.redBg,text:C.red,label:'Rejected'},
    };
    const sc=STAT[job.status]||STAT.assigned;
    const before=(job.beforePhotos||[]).length;
    const after=(job.afterPhotos||[]).length;
    return(
      <TouchableOpacity style={[S.card,{marginBottom:12}]} onPress={()=>setSelJob(job)}>
        <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:8}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
            <Text style={{color:C.green,fontWeight:'800',fontSize:14}}>{job.orderId||job.id?.slice(-6)}</Text>
            <View style={{paddingHorizontal:8,paddingVertical:2,borderRadius:10,backgroundColor:sc.bg}}>
              <Text style={{color:sc.text,fontSize:10,fontWeight:'700'}}>{sc.label}</Text>
            </View>
          </View>
          {job.delayFlag&&<Text style={{color:C.red,fontSize:11}}>⚠️ Delayed</Text>}
        </View>
        <Text style={{color:C.text,fontSize:14,fontWeight:'600'}}>{job.customerName||job.userName||'Customer'}</Text>
        <Text style={{color:C.text2,fontSize:12,marginTop:2}}>🔧 {job.serviceType||'Home Cleaning'}{job.carType?` · ${job.carType.charAt(0).toUpperCase()+job.carType.slice(1)}`:''}</Text>
        <Text style={{color:C.muted,fontSize:12,marginTop:2}}>📍 {(job.addressFull||'').substring(0,50)}{(job.addressFull||'').length>50?'...':''}</Text>
        <Text style={{color:C.muted,fontSize:11,marginTop:2}}>📅 {job.slot||job.scheduledTime||'Today'}</Text>
        {job.bookingMode==='recurring'&&job.recurFreq&&(
          <View style={{flexDirection:'row',alignItems:'center',gap:4,marginTop:4,flexWrap:'wrap'}}>
            <View style={{backgroundColor:'#FFF8E7',paddingHorizontal:7,paddingVertical:2,borderRadius:8,borderWidth:0.5,borderColor:'#D4A017'}}>
              <Text style={{color:'#B8860B',fontSize:10,fontWeight:'700'}}>🔄 {job.recurFreq} · {job.recurDuration||'1 month'} · {job.recurVisits||4} visits</Text>
            </View>
            {job.isRecurringChild&&<Text style={{color:C.muted,fontSize:10}}>Visit #{(job.recurIndex||0)+1}</Text>}
          </View>
        )}
        {/* 🚫 NO price/amount */}
        <View style={{flexDirection:'row',gap:8,marginTop:10}}>
          <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:8,backgroundColor:before>0?C.greenBg:C.orangeBg,borderWidth:0.5,borderColor:before>0?C.greenBd:C.orangeBd}}>
            <Text style={{color:before>0?C.green:C.orange,fontSize:10,fontWeight:'700'}}>📷 Before: {before}</Text>
          </View>
          <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:8,backgroundColor:after>0?C.greenBg:C.card2,borderWidth:0.5,borderColor:after>0?C.greenBd:C.border2}}>
            <Text style={{color:after>0?C.green:C.muted,fontSize:10,fontWeight:'700'}}>📷 After: {after}</Text>
          </View>
        </View>
        {job.status==='assigned'&&(
          <TouchableOpacity style={[S.btn,{backgroundColor:C.blue,paddingVertical:10,marginTop:10}]} onPress={()=>markOnTheWay(job)}>
            <Text style={[S.btnT,{fontSize:13}]}>🚀 Start Going</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // JOBS LIST
  const JobsTab=({jobs,emptyMsg})=>(
    <ScrollView style={{flex:1,padding:16}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green}/>}>
      {jobs.length===0?(
        <View style={{alignItems:'center',paddingTop:80}}>
          <Text style={{fontSize:60}}>{emptyMsg.includes('Active')?'⚡':'📋'}</Text>
          <Text style={{color:C.muted,fontSize:15,marginTop:16,textAlign:'center'}}>{emptyMsg}</Text>
        </View>
      ):jobs.map(job=><JobCard key={job.id} job={job}/>)}
      <View style={{height:100}}/>
    </ScrollView>
  );

  // WORK SUMMARY TAB (🚫 NO earnings amounts)
  const WorkSummaryTab=()=>(
    <ScrollView style={{flex:1,padding:16}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green}/>}>
      <Text style={{fontSize:17,fontWeight:'800',color:C.text,marginBottom:16}}>📊 My Work Summary</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:16}}>
        {[
          {label:'Completed Today',val:worker?.attendance?.jobsToday||0,icon:'📅',color:C.green},
          {label:'Completed This Week',val:worker?.attendance?.jobsWeek||0,icon:'📆',color:C.blue},
          {label:'Total Jobs Done',val:worker?.totalJobsCompleted||0,icon:'🏆',color:C.gold},
          {label:'Performance Score',val:`${worker?.performanceScore||85}%`,icon:'⭐',color:C.orange},
        ].map((stat,i)=>(
          <View key={i} style={{width:(W-44)/2,backgroundColor:C.card,borderRadius:18,padding:16,borderWidth:0.5,borderColor:C.border2,...SHADOW.card}}>
            <Text style={{fontSize:26,marginBottom:8}}>{stat.icon}</Text>
            <Text style={{fontSize:24,fontWeight:'900',color:stat.color}}>{stat.val}</Text>
            <Text style={{fontSize:11,color:C.muted,marginTop:4}}>{stat.label}</Text>
          </View>
        ))}
      </View>
      <View style={[S.card,{marginBottom:12}]}>
        <Text style={{color:C.text2,fontWeight:'700',marginBottom:14}}>📋 Attendance</Text>
        {[
          {label:'Status Today',val:worker?.attendance?.todayStatus||'Present',color:C.green},
          {label:'Days Present This Month',val:worker?.attendance?.daysPresent||0,color:C.text2},
          {label:'Days Absent',val:worker?.attendance?.daysAbsent||0,color:C.red},
          {label:'My Rating',val:`${worker?.ratingAvg||4.9} ⭐ (${worker?.totalReviews||0} reviews)`,color:C.gold},
        ].map((item,i)=>(
          <View key={i} style={{flexDirection:'row',justifyContent:'space-between',marginBottom:10}}>
            <Text style={{color:C.muted,fontSize:13}}>{item.label}</Text>
            <Text style={{color:item.color,fontWeight:'700',fontSize:13}}>{item.val}</Text>
          </View>
        ))}
      </View>
      {/* Recent completed — NO price */}
      <View style={[S.card,{marginBottom:12}]}>
        <Text style={{color:C.text2,fontWeight:'700',marginBottom:12}}>✅ Recently Completed</Text>
        {completedJobs.slice(0,5).map(job=>(
          <View key={job.id} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12,paddingBottom:12,borderBottomWidth:0.5,borderBottomColor:C.border}}>
            <View>
              <Text style={{color:C.text,fontWeight:'600'}}>{job.orderId||job.id?.slice(-6)}</Text>
              <Text style={{color:C.muted,fontSize:12,marginTop:2}}>{job.serviceType||'Cleaning'} · {timeAgo(job.completedAt)}</Text>
            </View>
            <View style={{backgroundColor:C.greenBg,paddingHorizontal:10,paddingVertical:4,borderRadius:10,borderWidth:0.5,borderColor:C.greenBd}}>
              <Text style={{color:C.green,fontSize:11,fontWeight:'700'}}>✓ Done</Text>
            </View>
          </View>
        ))}
        {completedJobs.length===0&&<Text style={{color:C.muted,textAlign:'center',padding:20}}>No completed jobs yet</Text>}
      </View>
      <View style={{height:100}}/>
    </ScrollView>
  );

  // PROFILE TAB
  const ProfileTab=()=>(
    <ScrollView style={{flex:1,padding:16}}>
      <View style={[S.card,{alignItems:'center',paddingVertical:28,marginBottom:16}]}>
        <View style={{width:72,height:72,borderRadius:36,backgroundColor:C.greenBg,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:C.greenBd,marginBottom:14}}>
          <Text style={{fontSize:30,fontWeight:'900',color:C.green}}>{worker?.name?.[0]||'V'}</Text>
        </View>
        <Text style={{fontSize:22,fontWeight:'900',color:C.text}}>{worker?.name}</Text>
        <Text style={{color:C.text2,marginTop:4}}>📞 +91 {worker?.phone}</Text>
        <View style={{paddingHorizontal:12,paddingVertical:4,borderRadius:12,marginTop:12,
          backgroundColor:worker?.status==='active'?C.greenBg:C.redBg,
          borderWidth:0.5,borderColor:worker?.status==='active'?C.greenBd:C.redBd}}>
          <Text style={{color:worker?.status==='active'?C.green:C.red,fontSize:12,fontWeight:'700'}}>
            {worker?.status==='active'?'● Active':'● '+worker?.status}
          </Text>
        </View>
        <Text style={{color:C.gold,fontSize:14,marginTop:10}}>⭐ {worker?.ratingAvg||4.9} ({worker?.totalReviews||0} reviews)</Text>
      </View>
      <View style={[S.card,{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}]}>
        <View>
          <Text style={{color:C.text,fontWeight:'700',fontSize:15}}>Available for Jobs</Text>
          <Text style={{color:C.muted,fontSize:12,marginTop:2}}>{isAvailable?'Receiving assignments':'Marked unavailable'}</Text>
        </View>
        <Switch value={isAvailable} onValueChange={toggleAvailability}
          trackColor={{false:C.redBg,true:C.green2}} thumbColor={isAvailable?C.green:'#888'}/>
      </View>
      <View style={[S.card,{marginBottom:12}]}>
        <Text style={{color:C.text2,fontWeight:'700',marginBottom:12}}>🛠 My Skills</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
          {(worker?.services||['Home Cleaning']).map(svc=>(
            <View key={svc} style={{paddingHorizontal:12,paddingVertical:6,borderRadius:12,backgroundColor:C.greenBg,borderWidth:0.5,borderColor:C.greenBd}}>
              <Text style={{color:C.green,fontSize:12,fontWeight:'600'}}>{svc}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={[S.card,{marginBottom:12}]}>
        <Text style={{color:C.text2,fontWeight:'700',marginBottom:12}}>📋 VEGA Standards</Text>
        {['🪷 Every home is a temple','👟 Remove shoes at every door','📸 Photos before and after mandatory',
          '📱 No personal calls during service','🧹 Top-to-bottom cleaning always',
          '😊 Namaste greeting to every customer','⭐ Request rating before leaving'].map((r,i)=>(
          <Text key={i} style={{color:C.text2,fontSize:12,lineHeight:22}}>{r}</Text>
        ))}
      </View>
      <TouchableOpacity style={[S.card,{flexDirection:'row',alignItems:'center',gap:12,marginBottom:12}]}
        onPress={()=>Alert.alert('Logout','Sign out?',[
          {text:'Cancel',style:'cancel'},
          {text:'Logout',style:'destructive',onPress:()=>{auth().signOut();setWorker(null);setMyJobs([]);setScreen('login');setTab('today');}},
        ])}>
        <Text style={{fontSize:20}}>🚪</Text>
        <Text style={{color:C.red,fontWeight:'700',fontSize:15}}>Logout</Text>
      </TouchableOpacity>
      <View style={{height:100}}/>
    </ScrollView>
  );

  // TABS
  const TABS=[
    {id:'today',   icon:'📅',label:'Today',  badge:todayJobs.filter(j=>j.status!=='completed').length},
    {id:'active',  icon:'⚡',label:'Active', badge:activeJobs.length},
    {id:'done',    icon:'✅',label:'Done',   badge:0},
    {id:'all',     icon:'📋',label:'All',    badge:0},
    {id:'summary', icon:'📊',label:'Summary',badge:0},
    {id:'profile', icon:'👤',label:'Profile',badge:0},
  ];

  return(
    <View style={{flex:1,backgroundColor:C.bg}}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <SafeAreaView style={{flex:1}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,paddingVertical:10,borderBottomWidth:0.5,borderBottomColor:C.border}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
            <Text style={{fontSize:16}}>🪷</Text>
            <Text style={{fontSize:15,fontWeight:'900',color:C.green,letterSpacing:2}}>VEGA</Text>
          </View>
          <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
            <View style={{paddingHorizontal:8,paddingVertical:2,borderRadius:8,backgroundColor:isAvailable?C.greenBg:C.redBg,borderWidth:0.5,borderColor:isAvailable?C.greenBd:C.redBd}}>
              <Text style={{color:isAvailable?C.green:C.red,fontSize:10,fontWeight:'700'}}>{isAvailable?'● Available':'● Unavailable'}</Text>
            </View>
            <Text style={{color:C.text2,fontSize:13}}>{worker?.name?.split(' ')[0]}</Text>
          </View>
        </View>
        <View style={{flex:1}}>
          {tab==='today'   &&<JobsTab jobs={todayJobs} emptyMsg="No jobs today — rest well! 🪷"/>}
          {tab==='active'  &&<JobsTab jobs={activeJobs} emptyMsg="No active jobs right now"/>}
          {tab==='done'    &&<JobsTab jobs={completedJobs} emptyMsg="No completed jobs yet"/>}
          {tab==='all'     &&<JobsTab jobs={myJobs} emptyMsg="No jobs assigned yet"/>}
          {tab==='summary' &&<WorkSummaryTab/>}
          {tab==='profile' &&<ProfileTab/>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{maxHeight:62,borderTopWidth:0.5,borderTopColor:C.border,backgroundColor:C.card}}
          contentContainerStyle={{flexDirection:'row',paddingBottom:Platform.OS==='ios'?16:4,paddingTop:6}}>
          {TABS.map(t=>(
            <TouchableOpacity key={t.id} style={{paddingHorizontal:14,alignItems:'center',gap:2}} onPress={()=>setTab(t.id)}>
              <View style={{position:'relative'}}>
                <Text style={{fontSize:tab===t.id?22:18}}>{t.icon}</Text>
                {t.badge>0&&(
                  <View style={{position:'absolute',top:-4,right:-8,backgroundColor:C.red,width:16,height:16,borderRadius:8,alignItems:'center',justifyContent:'center'}}>
                    <Text style={{color:'#FFF',fontSize:9,fontWeight:'900'}}>{t.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={{fontSize:9,fontWeight:tab===t.id?'800':'500',color:tab===t.id?C.green:C.muted}}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
      <JobDetailModal/>
    </View>
  );
}

const S=StyleSheet.create({
  lbl:{color:'#587060',fontSize:12,fontWeight:'600',marginBottom:8,marginTop:14},
  inp:{backgroundColor:'#0A1A0E',borderWidth:0.5,borderColor:'#1A3018',borderRadius:14,padding:14,fontSize:15},
  phoneRow:{flexDirection:'row',backgroundColor:'#0A1A0E',borderWidth:0.5,borderColor:'#1A3018',borderRadius:14,overflow:'hidden'},
  flag:{padding:14,fontSize:13,fontWeight:'700',color:'#EDF5EF',backgroundColor:'#0E2014',borderRightWidth:0.5,borderRightColor:'#1A3018'},
  phoneInp:{flex:1,padding:14,fontSize:15,letterSpacing:2},
  btn:{backgroundColor:'#E8520A',borderRadius:30,padding:15,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:8},
  btnT:{color:'#FFF',fontSize:14,fontWeight:'800'},
  card:{backgroundColor:'#0A1A0E',borderRadius:18,padding:16,borderWidth:0.5,borderColor:'#1A3018'},
  detailCard:{backgroundColor:'#0A1A0E',borderRadius:18,padding:16,borderWidth:0.5,borderColor:'#1A3018',marginBottom:12},
  detailLabel:{color:'#587060',fontSize:10,fontWeight:'700',letterSpacing:1.5},
  actionBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,padding:12,borderRadius:14,borderWidth:1},
});
