"use client";
import { supabase } from "@/lib/supabase";

const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf","text/plain","application/zip","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
export async function uploadWorkFiles(fileList,assignmentId){
  const files=Array.from(fileList||[]); if(files.length>10)throw new Error("Upload a maximum of 10 files per submission.");
  const{data:session}=await supabase.auth.getSession();const user=session.session?.user;if(!user)throw new Error("Your session expired.");
  const uploaded=[];
  for(const file of files){if(file.size>20*1024*1024)throw new Error(`${file.name} is larger than 20 MB.`);if(!allowed.has(file.type))throw new Error(`${file.name} is not an allowed file type.`);const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=`${user.id}/${assignmentId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;const{error}=await supabase.storage.from("work-submissions").upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;uploaded.push({path,name:file.name,type:file.type,size:file.size});}
  return uploaded;
}
