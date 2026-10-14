'use client';
import { useState } from 'react';
import { authClient, demo } from '@/lib/client';
import Link from 'next/link';
export default function Login() {
 const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 // Google is the only way in: the same call creates an account or signs in, then navigates away to Google.
 async function google() {if(!authClient) return; setBusy(true);setError('');try {
  const {error}=await authClient.signIn.social({provider:'google',callbackURL:`${window.location.origin}/dashboard`});
  if(error)throw new Error(error.message||'Unable to continue with Google.');
 }catch(e){setError(e instanceof Error?e.message:'Unable to continue with Google.');setBusy(false);}}
 return <main id="main" className="wrap page auth-page"><div><div className="eyebrow">YOUR CTRUE WORKSPACE</div><h1>Welcome.</h1><p className="lead">Your sessions, your context,<br />your next clear thought.</p></div><section className="panel auth-card"><h2>Sign in or create an account</h2>{!authClient&&<p role="status" className="notice">The local demo runs without an account.</p>}<button type="button" className="button primary" disabled={busy||!authClient} onClick={()=>void google()}>{busy?'Opening Google…':'Continue with Google'} <span aria-hidden="true">↗</span></button><p className="fine">New here? Continuing creates your account.</p>{error&&<p role="alert" className="error">{error}</p>}{demo&&<Link className="button" href="/dashboard">Open local demo ↗</Link>}</section></main>;
}
