// Built-in example threads and the BKMs written from them (cached, so the demo works instantly and costs nothing).
window.BKM_SEED = [
{
  thread: `[02:14] alerts: gpu-r2-n07 job 48231 FAILED: CUDA error: unspecified launch failure
[02:16] dana: dmesg -T | grep -i xid -> Xid 79 on 0000:9a:00, "GPU has fallen off the bus". nvidia-smi only lists 7 GPUs
[02:17] dana: tried nvidia-smi -r -i 4 -> "Unable to reset GPU 00000000:9A:00.0: GPU is lost"
[02:19] mike: drain it first!! scontrol update nodename=gpu-r2-n07 state=drain reason="Xid79 GPU4"
[02:21] dana: did a warm reboot, GPU still missing after boot
[02:30] mike: needs a full power cycle from the BMC, a warm reboot doesn't drop PCIe power. ipmitool -I lanplus -H gpu-r2-n07-bmc chassis power cycle
[02:41] dana: back up, 8 GPUs. SEL only shows the power cycle. temps were normal before (68C)
[02:55] dana: dcgmi diag -r 3 all pass. resumed
[03:02] mike: if it comes back on the same GPU reseat it, then RMA. pretty sure r2 had one of these earlier this month, check`,
  bkm: {
    title: 'GPU fell off the bus (Xid 79) on HGX H100: recover with a BMC power cycle',
    summary: 'A GPU drops off PCIe (Xid 79) and jobs on the node crash; nvidia-smi shows 7 of 8 GPUs and a GPU reset or warm reboot does not bring it back. A full power cycle through the BMC recovers it; repeat failures on the same GPU mean reseat, then RMA.',
    tags: ['Xid 79', 'PCIe', 'GPU missing', 'HGX H100', 'BMC', 'Slurm drain'],
    platform: 'HGX H100 node, Slurm-managed',
    symptoms: ['Jobs fail with "CUDA error: unspecified launch failure"', 'dmesg: NVRM: Xid (PCI:0000:<bus>): 79, GPU has fallen off the bus', 'nvidia-smi lists 7 GPUs or "Unable to determine the device handle"', 'nvidia-smi -r fails with "GPU is lost"'],
    quick_checks: [
      { cmd: 'dmesg -T | grep -i xid', expect: 'Xid 79 on one bus ID; Xid 43/45 after it are side effects' },
      { cmd: 'nvidia-smi -L | wc -l', expect: '7 instead of 8' },
      { cmd: 'ipmitool -I lanplus -H <node>-bmc -U $BMC_USER -E sel elist | tail -20', expect: 'Look for power, thermal or PCIe events at the failure time' },
    ],
    root_cause: 'The GPU stopped responding on PCIe and the driver marked it lost. Software resets cannot recover it; only removing power resets the device and its link. Underlying causes include a failing GPU, power delivery, overheating, or the PCIe path.',
    fix_steps: [
      { step: 'Drain the node so the scheduler stops placing jobs on it.', cmd: 'scontrol update nodename=<node> state=drain reason="Xid79 GPU<n>"' },
      { step: 'Check the BMC event log for power or thermal events around the failure.', cmd: 'ipmitool -I lanplus -H <node>-bmc -U $BMC_USER -E sel elist | tail -30' },
      { step: 'Do a full power cycle through the BMC. A warm reboot keeps PCIe powered and usually leaves the GPU missing.', cmd: 'ipmitool -I lanplus -H <node>-bmc -U $BMC_USER -E chassis power cycle' },
      { step: 'After boot, confirm all 8 GPUs are present.', cmd: 'nvidia-smi -L' },
    ],
    verify: [
      { cmd: 'nvidia-smi -L', expect: '8 GPUs listed' },
      { cmd: 'dcgmi diag -r 3', expect: 'All tests Pass' },
      { cmd: 'scontrol update nodename=<node> state=resume', expect: 'Node back to IDLE/ALLOC' },
    ],
    escalate_when: ['Xid 79 returns on the same GPU: reseat it, and if it recurs, open an RMA', 'Xid 79 moves between GPUs on the same node: suspect baseboard or power, open a vendor case', 'BMC log shows PSU or thermal events at the time of failure: fix those first'],
    prevention: ['Track Xid 79 per GPU serial so repeat offenders are caught early', 'Alert on GPU count < 8 per node, not just on job failures'],
    customer_note: 'Your job stopped because one GPU on the node had a hardware fault, not because of your code. We removed the node from scheduling and recovered it after full diagnostics; you can resubmit, or resume from your last checkpoint.',
    gaps: ['Whether this GPU (by serial) had an earlier Xid 79, as Mike suspected for rack 2', 'Root cause of the drop (no power or thermal events were found)'],
    quiz: [
      { q: 'dmesg shows Xid 79 for one GPU and nvidia-smi lists 7 GPUs. What do you do first?', options: ['Drain the node in Slurm', 'Open an RMA for the GPU', 'Reboot the node right away', 'Tell the customer to resubmit'], answer: 0, why: 'Stop new jobs landing on a broken node before anything else.' },
      { q: 'nvidia-smi -r says "GPU is lost". What brings the GPU back most reliably?', options: ['A warm reboot', 'A full power cycle through the BMC', 'Reloading the nvidia kernel module', 'Restarting nvidia-persistenced'], answer: 1, why: 'Only removing power resets a GPU that has dropped off PCIe; a warm reboot keeps it powered.' },
      { q: 'After the power cycle all 8 GPUs show up. What next?', options: ['Resume the node immediately', 'Run dcgmi diag -r 3, then resume', 'Open an RMA anyway', 'Leave it drained for a week'], answer: 1, why: 'Prove it is healthy before it takes customer jobs again.' },
      { q: 'The same GPU throws Xid 79 again two days later. Best next step?', options: ['Power-cycle again and move on', 'Reseat the GPU, and RMA it if it recurs', 'Upgrade the CUDA toolkit', 'Ask the customer to lower batch size'], answer: 1, why: 'A repeat on the same GPU points at the GPU or its seating, not a one-off glitch.' },
      { q: 'Xid 43 and Xid 45 appear right after the Xid 79. How should you read them?', options: ['Customer code bugs to report', 'Side effects of the GPU dropping off the bus', 'A separate NVLink failure', 'Signs of a driver mismatch'], answer: 1, why: 'Apps on the lost GPU get stopped and cleaned up; those Xids follow the real fault.' },
    ],
  },
},
{
  thread: `#ops 06:05 jen: every job on gpu-r1-n08 failing immediately: cudaGetDeviceCount: system not yet initialized (error 802)
06:07 jen: nvidia-smi looks totally fine?? 8 GPUs, no Xids
06:09 raj: that's fabric manager. systemctl status nvidia-fabricmanager -> failed
06:10 raj: journal: "fabric manager NVIDIA GPU driver interface version 550.54.15 doesn't match with driver version 550.90.07"
06:11 jen: yeah we pushed the 550.90.07 driver last night with ansible, FM package wasn't in the play
06:14 raj: drained. apt-get install nvidia-fabricmanager-550=550.90.07-1 ; systemctl enable --now nvidia-fabricmanager
06:16 raj: active (running). deviceQuery ok, dcgmi diag -r 1 pass. resumed
06:20 jen: checked the other 31 nodes, 3 more had the same thing, fixed. need FM in the driver playbook + apt-mark hold both`,
  bkm: {
    title: 'CUDA error 802 "system not yet initialized" on HGX: Fabric Manager version mismatch after a driver update',
    summary: 'After a driver update, every CUDA job on an NVSwitch node fails with error 802 even though nvidia-smi looks healthy. Fabric Manager failed to start because its version no longer matches the driver; installing the matching Fabric Manager and starting it fixes it.',
    tags: ['CUDA 802', 'Fabric Manager', 'NVSwitch', 'driver update', 'HGX H100'],
    platform: 'HGX/DGX nodes with NVSwitch, Ubuntu, driver 550 branch',
    symptoms: ['Jobs fail at start: cudaGetDeviceCount: system not yet initialized (error 802)', 'nvidia-smi shows all 8 GPUs and no Xid errors', 'systemctl status nvidia-fabricmanager: failed', 'FM log: "...driver interface version X doesn\'t match with driver version Y"'],
    quick_checks: [
      { cmd: 'systemctl status nvidia-fabricmanager --no-pager', expect: 'Active: failed' },
      { cmd: 'journalctl -u nvidia-fabricmanager -b --no-pager | tail', expect: 'version mismatch message naming both versions' },
      { cmd: 'cat /proc/driver/nvidia/version; dpkg -l | grep -E "fabricmanager|nvidia-driver"', expect: 'Driver and Fabric Manager versions differ' },
    ],
    root_cause: 'On NVSwitch systems CUDA cannot initialize until Fabric Manager has configured the NVLink fabric, and Fabric Manager refuses to run unless its version exactly matches the driver. The driver was upgraded by automation that did not upgrade the Fabric Manager package.',
    fix_steps: [
      { step: 'Drain the node.', cmd: 'scontrol update nodename=<node> state=drain reason="FM/driver mismatch"' },
      { step: 'Install the Fabric Manager build that matches the running driver.', cmd: 'apt-get install -y nvidia-fabricmanager-<branch>=<driver-version>-1' },
      { step: 'Start it and enable it at boot.', cmd: 'systemctl enable --now nvidia-fabricmanager' },
      { step: 'Check the rest of the fleet for the same mismatch.', cmd: 'for n in $(sinfo -h -N -o %N); do ssh $n "systemctl is-active nvidia-fabricmanager"; done' },
    ],
    verify: [
      { cmd: 'systemctl status nvidia-fabricmanager', expect: 'active (running)' },
      { cmd: 'dcgmi diag -r 1', expect: 'Pass (CUDA initializes)' },
      { cmd: 'scontrol update nodename=<node> state=resume', expect: 'Node back in service' },
    ],
    escalate_when: ['Fabric Manager runs but CUDA still returns 802: check NVSwitch health (SXid errors) and open a vendor case', 'Matching versions are not available in the repo: escalate to the platform team before mixing versions'],
    prevention: ['Upgrade driver and Fabric Manager in the same playbook step', 'apt-mark hold both packages so they move together', 'Add a post-update check: systemctl is-active nvidia-fabricmanager on every NVSwitch node'],
    customer_note: 'Jobs on that node failed to start because of a software version mismatch from overnight maintenance; the hardware was fine and your code was not the cause. We corrected it and verified the node; please resubmit.',
    gaps: [],
    quiz: [
      { q: 'Every job on an HGX node fails with CUDA error 802, but nvidia-smi shows 8 healthy GPUs. What do you check first?', options: ['Row remapper status', 'systemctl status nvidia-fabricmanager', 'InfiniBand port state', 'The customer\'s batch size'], answer: 1, why: 'Error 802 on NVSwitch systems is the classic Fabric Manager symptom.' },
      { q: 'The Fabric Manager log says its version doesn\'t match the driver. What fixes it?', options: ['Reboot the node', 'Install the Fabric Manager version that exactly matches the driver', 'Downgrade CUDA in the container', 'RMA the NVSwitch baseboard'], answer: 1, why: 'Fabric Manager only runs with an exactly matching driver version.' },
      { q: 'Why did this happen on several nodes at once?', options: ['A bad batch of GPUs', 'The driver update playbook didn\'t update Fabric Manager', 'A cooling failure in one rack', 'NCCL misconfiguration'], answer: 1, why: 'Fleet-wide timing after maintenance points at the change, not hardware.' },
      { q: 'Fabric Manager is now active (running). What do you run before resuming?', options: ['Nothing, resume now', 'A quick DCGM diag to prove CUDA initializes', 'A full burn-in for 24 hours', 'ibstat on every port'], answer: 1, why: 'Verify the fix with a quick CUDA/DCGM check before returning the node.' },
      { q: 'Which prevention step stops this from coming back?', options: ['Pin and upgrade driver and Fabric Manager together', 'Disable Fabric Manager', 'Only update drivers on weekends', 'Turn off ECC'], answer: 0, why: 'The two packages must always move together.' },
    ],
  },
},
{
  thread: `ticket #8812 (customer): our 32-node training job hangs every few hours, NCCL watchdog timeout after 30 min, have to restart
note: every hang includes gpu-r4-n05 in the allocation
note: ibstat on r4-n05: mlx5_3 State: Down, Physical state: Polling. other 7 ports Active / 400
note: dmesg: mlx5_core 0000:c3:00.0: Port module event[error]: module 0, Cable error, High Temperature
note: perfquery -x: LinkDownedCounter 14, SymbolErrorCounter maxed
note: drained r4-n05. DC tech reseated the optic on rail 3 -> came up at Rate 200, symbol errors still climbing
note: tech replaced OSFP optic + cable -> Active 400, counters stayed clean through 1h burn-in, all_reduce_perf 2 nodes ok
note: resumed. customer re-ran, no hang in 24h. closed`,
  bkm: {
    title: 'Multi-node NCCL hangs traced to one InfiniBand rail: failing OSFP optic',
    summary: 'A large training job hangs with NCCL watchdog timeouts, always with the same node in the allocation. One IB port on that node is down or degraded because of a failing optic; replacing the optic and cable restores full-rate links and the hangs stop.',
    tags: ['InfiniBand', 'NCCL timeout', 'optic', 'mlx5', 'rail', 'multi-node'],
    platform: 'HGX H100 nodes, 8 × NDR 400G IB rails (ConnectX-7)',
    symptoms: ['NCCL watchdog: collective operation timeout after ~30 min', 'Hangs only happen when one particular node is in the job', 'ibstat: one port State: Down / Physical state: Polling, or a lower Rate than the others', 'dmesg: mlx5_core Port module event[error] ... Cable error / High Temperature'],
    quick_checks: [
      { cmd: 'sacct -j <jobid> -o NodeList  # across several hung jobs', expect: 'One node is common to all of them' },
      { cmd: 'ibstat | grep -E "CA |State|Rate"', expect: 'One port Down/Polling or below 400' },
      { cmd: 'perfquery -x', expect: 'LinkDownedCounter and SymbolErrorCounter non-zero and climbing' },
      { cmd: 'dmesg -T | grep -i "module event"', expect: 'Cable error / High Temperature on that port' },
    ],
    root_cause: 'A failing OSFP optic on one rail kept dropping or degrading the link. Because collectives need every rank, one bad rail on one node stalls the whole multi-node job until the NCCL watchdog times out.',
    fix_steps: [
      { step: 'Find the common node across hung jobs.', cmd: 'sacct -j <jobid1>,<jobid2> -o JobID,NodeList' },
      { step: 'Drain it.', cmd: 'scontrol update nodename=<node> state=drain reason="IB rail <n> down"' },
      { step: 'Dispatch a tech to reseat the optic. If the link comes back degraded or errors keep climbing, replace the optic and cable.' },
      { step: 'Clear counters, then burn in.', cmd: 'perfquery -x -R  # then watch for an hour' },
    ],
    verify: [
      { cmd: 'ibstat | grep -E "State|Rate"', expect: 'All ports Active / LinkUp / 400' },
      { cmd: 'perfquery -x', expect: 'Error counters stay at 0 through burn-in' },
      { cmd: 'all_reduce_perf -b 8 -e 8G -f 2 -g 8  # 2 nodes, via mpirun/srun', expect: 'Expected bus bandwidth, no errors' },
      { cmd: 'scontrol update nodename=<node> state=resume', expect: 'Back in service' },
    ],
    escalate_when: ['New optic and cable still flap: suspect the NIC or the switch port; check the other end of the link', 'Several nodes on the same leaf switch show errors: escalate to the network team'],
    prevention: ['Alert on IB ports not Active/400 and on climbing LinkDowned/SymbolError counters', 'Watch optic temperature (mlxlink -m) and replace hot modules proactively'],
    customer_note: 'The hangs came from a faulty network link on one node in your allocation, not from your training code. We replaced the part, verified full-speed links, and you should not see these timeouts again; thanks for the detailed report.',
    gaps: ['Whether the switch side of the link showed errors as well'],
    quiz: [
      { q: 'A 32-node job hangs with NCCL timeouts every few hours. What\'s the fastest first clue?', options: ['Check which node is common to every hung job', 'Ask the customer to update PyTorch', 'Reboot all 32 nodes', 'Run dcgmi diag on every node'], answer: 0, why: 'One bad node stalls the whole collective; find the common factor first.' },
      { q: 'ibstat shows one port "State: Down, Physical state: Polling". What does that mean?', options: ['The port is idle but healthy', 'No link: optic, cable or the far-end port', 'The GPU on that rail is broken', 'NCCL is misconfigured'], answer: 1, why: 'Polling means it is looking for a link partner and not finding one.' },
      { q: 'After reseating, the port comes up at Rate 200 while others show 400. What next?', options: ['Resume, 200 is fine', 'Replace the optic and cable', 'Lower NCCL buffer sizes', 'RMA the GPU on that rail'], answer: 1, why: 'A degraded rate with climbing symbol errors means a bad optic or cable lane.' },
      { q: 'Which check proves the fix before resuming?', options: ['ibstat alone', 'Full rate on all ports, clean counters through burn-in, and an nccl-tests run', 'A single ping between nodes', 'nvidia-smi'], answer: 1, why: 'Link state, error counters and real collective traffic together prove it.' },
      { q: 'Why does one bad rail hang a 32-node job?', options: ['Slurm cancels the job', 'Collectives wait for every rank, so one stuck link stalls everyone', 'The GPU overheats', 'NCCL retries forever by design'], answer: 1, why: 'All-reduce can\'t finish until every rank contributes.' },
    ],
  },
},
];
