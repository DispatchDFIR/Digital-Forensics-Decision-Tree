import { uid } from './shared.js';

// Starter content shown until the admin saves a tree to Firestore for the first time.
const q = (text, yes = null, no = null) => ({ id: uid(), type: 'question', text, yes, no });
const a = (text) => ({ id: uid(), type: 'action', text });

const GENERAL = 'General';
const MITRE = 'MITRE ATT&CK Tactics';

export const TREES = [
  {
    id: 'general-process',
    group: GENERAL,
    name: 'General Forensic Process',
    starter: () => q('Is there legal authority to proceed (warrant, consent, or policy authorisation)?',
      q('Is the device currently powered ON?',
        q('Is volatile data relevant (RAM, network connections, running processes, encryption keys)?',
          a('Isolate from the network, photograph the screen, then capture volatile data in order of volatility (RAM → network state → processes) using trusted tools. Log every action with a timestamp.'),
          q('Is full-disk encryption likely (BitLocker, FileVault, VeraCrypt)?',
            a('Do not power off. Capture a live logical image and any recovery keys while the volume is unlocked, then document before shutdown.'),
            a('Photograph and document the system state, then shut down or pull power according to your SOP for that OS.'))),
        q('Is it a mobile phone or tablet?',
          a('Do NOT power it on. Record make/model/IMEI, place it in a Faraday bag, and proceed to extraction (logical / file system / physical) per lab SOP.'),
          q('Will imaging be performed on-site?',
            a('Use a hardware write-blocker, create a forensic image (E01/raw), verify with SHA-256, and record the hash in the chain-of-custody log.'),
            a('Label, bag and seal the media with tamper-evident packaging, complete chain-of-custody, and transport to the lab for imaging.')))),
      a('Stop. Secure the scene and prevent changes, but do not examine or collect until legal authority is obtained.'))
  },
  {
    id: 'mitre-reconnaissance',
    group: MITRE,
    name: 'TA0043 · Reconnaissance',
    starter: () => q('Do perimeter/WAF/IDS logs show scanning or probing of your external assets (T1595)?',
      q('Did the scanning come before other suspicious activity in this incident?',
        a('Record source IPs, timeframes and targeted services. Correlate with later Initial Access attempts and add the IPs to the incident IOC list.'),
        a('Likely background internet noise. Note it, and block or rate-limit if volume is significant.')),
      q('Is there evidence of targeted OSINT or phishing-for-information against staff (T1598)?',
        a('Collect the lures/emails, identify which staff were targeted, and warn them about likely follow-up phishing.'),
        a('No reconnaissance evidence found. Document the negative finding and move on.')))
  },
  {
    id: 'mitre-resource-development',
    group: MITRE,
    name: 'TA0042 · Resource Development',
    starter: () => q('Did the attacker use infrastructure (domains, IPs, cloud accounts) seen in this incident (T1583/T1584)?',
      q('Was any of that infrastructure registered or stood up shortly before the incident?',
        a('Capture WHOIS, passive DNS and hosting details. Pivot on registrant data, certificates and IPs to find related infrastructure.'),
        a('Check threat intel for prior use of the infrastructure to support attribution.')),
      a('Document the negative finding. Revisit once C2 and exfiltration analysis is complete.'))
  },
  {
    id: 'mitre-initial-access',
    group: MITRE,
    name: 'TA0001 · Initial Access',
    starter: () => q('Is there a suspicious email, attachment, or link that a user interacted with (T1566 Phishing)?',
      q('Was the attachment opened or the link clicked?',
        a('Preserve the original email (.eml with headers), hash the attachment, sandbox it, and identify every recipient who received the same lure.'),
        a('Quarantine the email org-wide, block the sender/domain/URL, and confirm no other user interacted with it.')),
      q('Is there evidence of exploitation of an internet-facing service (T1190)?',
        a('Preserve web/app/VPN logs, identify the vulnerable component and version, look for web shells, and patch or isolate the service.'),
        q('Is there a suspicious logon from a valid account or remote service (T1078 / T1133)?',
          a('Review authentication logs (e.g. Event ID 4624, VPN/IdP logs) for unusual source IPs, times or MFA anomalies. Reset credentials and revoke sessions.'),
          a('Initial access vector not yet identified. Widen the timeline and check supply chain, removable media and trusted relationships.'))))
  },
  {
    id: 'mitre-execution',
    group: MITRE,
    name: 'TA0002 · Execution',
    starter: () => q('Is there evidence of suspicious command or script execution (T1059: PowerShell, cmd, bash, etc.)?',
      q('Is PowerShell script block logging available (Event ID 4104)?',
        a('Extract and decode the script blocks, identify payloads and downloaded content, and record all IOCs.'),
        a('Check process creation logs (Event ID 4688 / Sysmon 1), Prefetch, Amcache and shell history for the command lines.')),
      q('Were scheduled tasks or WMI used to launch code (T1053.005 / T1047)?',
        a('Collect the task XML or WMI subscriptions, record the command, author and trigger, and check Event ID 4698.'),
        a('No execution evidence found yet. Check user-executed files (T1204) in Downloads/Temp and browser download history.')))
  },
  {
    id: 'mitre-persistence',
    group: MITRE,
    name: 'TA0003 · Persistence',
    starter: () => q('Are there unexpected autostart entries (Run keys, Startup folder) (T1547.001)?',
      a('Export the relevant registry hives, record the value names and target paths, then hash and analyse the referenced binaries.'),
      q('Were new services or scheduled tasks created (T1543.003 / T1053.005)?',
        a('Review Event ID 7045 (service installed) and 4698 (task created). Capture the binary paths and creation times.'),
        q('Were new accounts created or existing accounts modified (T1136 / T1098)?',
          a('Review Event IDs 4720/4738 and cloud IdP audit logs. Disable rogue accounts and record who created them and when.'),
          a('No persistence found with these checks. Consider WMI subscriptions, web shells, implants in startup scripts, and cloud app consents.'))))
  },
  {
    id: 'mitre-privilege-escalation',
    group: MITRE,
    name: 'TA0004 · Privilege Escalation',
    starter: () => q('Did a low-privileged account or process gain admin/SYSTEM rights?',
      q('Is there evidence of a local exploit (T1068) or UAC bypass (T1548.002)?',
        a('Identify the vulnerable component and CVE, preserve the exploit binary/artifacts, and check other hosts for the same vulnerability.'),
        a('Check for abuse of valid admin credentials (T1078), group membership changes (Event ID 4728/4732), and special privilege logons (4672).')),
      a('No escalation evidence found. Confirm what privileges the attacker actually held, as this limits which other tactics were possible.'))
  },
  {
    id: 'mitre-defense-evasion',
    group: MITRE,
    name: 'TA0005 · Defense Evasion',
    starter: () => q('Were logs cleared or logging disabled (T1070.001, e.g. Event ID 1102 / 104)?',
      a('Record the time of clearing and the account used. Recover data from forwarded logs/SIEM, VSS, or unallocated space.'),
      q('Were security tools disabled or tampered with (T1562.001)?',
        a('Collect EDR/AV tamper alerts and service state changes, and establish the window when the host was unmonitored.'),
        q('Is there evidence of process injection or masquerading (T1055 / T1036)?',
          a('Capture memory, analyse it with Volatility (malfind, pslist/pstree), and compare binary names and paths against legitimate locations.'),
          a('No evasion found with these checks. Look for timestomping, indicator removal, and signed binary proxy execution (LOLBins).'))))
  },
  {
    id: 'mitre-credential-access',
    group: MITRE,
    name: 'TA0006 · Credential Access',
    starter: () => q('Was LSASS memory accessed or dumped (T1003.001)?',
      a('Treat all credentials cached on the host as compromised. Reset affected accounts and look for dump files and tools (e.g. procdump, comsvcs.dll, Mimikatz).'),
      q('Is there evidence of brute force or password spraying (T1110)?',
        a('Review Event ID 4625 and IdP sign-in logs, identify targeted accounts and source IPs, and check for a successful logon after the failures.'),
        q('Is there evidence of Kerberoasting or other ticket abuse (T1558)?',
          a('Review Event ID 4769 for RC4 ticket requests against service accounts. Rotate the affected service account passwords.'),
          a('No credential access found with these checks. Consider browser credential stores, keylogging, and credentials in files or scripts.'))))
  },
  {
    id: 'mitre-discovery',
    group: MITRE,
    name: 'TA0007 · Discovery',
    starter: () => q('Were enumeration commands run (whoami, net user/group, nltest, ipconfig, systeminfo)?',
      a('Build a timeline of discovery commands from process creation logs and shell history. It shows what the attacker learned and is often the step before lateral movement.'),
      q('Is there evidence of AD or network scanning tools (e.g. BloodHound/SharpHound, AdFind, port scanners)?',
        a('Identify the tool, its output files and the scope of the scan. Assume the attacker has a map of the environment.'),
        a('No discovery activity found. Note it and check whether the attacker already had prior knowledge of the environment.')))
  },
  {
    id: 'mitre-lateral-movement',
    group: MITRE,
    name: 'TA0008 · Lateral Movement',
    starter: () => q('Are there RDP logons between internal hosts (T1021.001, Event ID 4624 type 10)?',
      a('Map source → destination hosts and accounts, collect RDP bitmap cache and Terminal Services logs, and scope every host touched.'),
      q('Is there evidence of SMB/admin share or remote service execution (T1021.002, e.g. PsExec, 7045 services)?',
        a('Identify the remote services created, binaries copied to ADMIN$/C$, and the accounts used. Add those hosts to scope.'),
        q('Is there evidence of pass-the-hash or pass-the-ticket (T1550)?',
          a('Look for NTLM logons (4624 type 3/9) with unusual source hosts, and reset the affected credentials, including krbtgt if needed.'),
          a('No lateral movement found yet. Check WinRM/WMI remote execution, SSH, and remote management tools.'))))
  },
  {
    id: 'mitre-collection',
    group: MITRE,
    name: 'TA0009 · Collection',
    starter: () => q('Was data staged or archived before possible exfiltration (T1074 / T1560)?',
      a('Find the archives (7z/rar/zip) and staging directories, record their size, contents and timestamps, and hash the files.'),
      q('Were email, file shares or cloud storage bulk-accessed (T1114 / T1039 / T1530)?',
        a('Pull mailbox/file audit logs to identify exactly which data was accessed, by which account, and when.'),
        a('No collection found. Also check for screen capture, keylogging, and clipboard data collection.')))
  },
  {
    id: 'mitre-command-and-control',
    group: MITRE,
    name: 'TA0011 · Command and Control',
    starter: () => q('Is there periodic (beaconing) outbound traffic to an unusual destination (T1071)?',
      q('Is the destination a known-malicious or newly registered domain/IP?',
        a('Block it at the perimeter, sinkhole DNS, identify every internal host talking to it, and collect the implant from those hosts.'),
        a('Investigate further: check the process making the connections, the JA3/JA4 fingerprint, and the certificate details.')),
      q('Is there DNS tunnelling, a proxy/tunnel tool, or a remote access tool in use (T1572 / T1219)?',
        a('Identify the tool (e.g. ngrok, AnyDesk, Cobalt Strike), its configuration and operator infrastructure, then block and remove it.'),
        a('No C2 found. Review proxy and DNS logs for the full incident window before closing this out.')))
  },
  {
    id: 'mitre-exfiltration',
    group: MITRE,
    name: 'TA0010 · Exfiltration',
    starter: () => q('Is there an unusually large outbound transfer from an affected host?',
      q('Was the destination a cloud storage or file-sharing service (T1567.002)?',
        a('Identify the service and account, request logs/preservation from the provider, and quantify what was uploaded.'),
        a('Check whether it went over the C2 channel (T1041) or an alternative protocol such as FTP/SFTP or DNS (T1048).')),
      a('No exfiltration evidence found. Document data-at-risk anyway for legal/regulatory assessment, and note any logging gaps.'))
  },
  {
    id: 'mitre-impact',
    group: MITRE,
    name: 'TA0040 · Impact',
    starter: () => q('Were files encrypted or a ransom note dropped (T1486)?',
      q('Were backups or shadow copies deleted (T1490, e.g. vssadmin delete shadows)?',
        a('Isolate affected networks immediately, preserve a sample of encrypted files and the ransom note, and check offline/immutable backups before restoring.'),
        a('Check whether Volume Shadow Copies are recoverable, preserve encrypted samples, and identify the ransomware family (e.g. ID Ransomware).')),
      q('Was data destroyed, systems wiped, or services disrupted (T1485 / T1561 / T1499)?',
        a('Preserve disk images of affected systems before rebuilding, and record the scope and timeline of the disruption.'),
        a('No impact observed yet. Prioritise containment to prevent the attacker reaching this stage.')))
  }
];

export function findTree(id) {
  return TREES.find((t) => t.id === id);
}
