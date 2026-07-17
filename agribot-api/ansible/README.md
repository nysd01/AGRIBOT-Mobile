# Ansible — Infrastructure as Code (rubric §5, 2.5 marks)

Two idempotent playbooks that stand up and deploy AGRIBOT on the VPS with **zero manual steps**.

| Playbook | What it does |
|---|---|
| `playbook-provision.yml` | Installs Docker + git + ufw, opens firewall ports, enables firewall, clones the repo |
| `playbook-deploy.yml` | Pulls latest code, creates `.env`, `docker compose up`, waits for `/health` = 200 |

## Setup (on your laptop or the VPS)
```bash
pip install ansible
ansible-galaxy collection install community.general   # for the ufw module
cd agribot-api/ansible
```

## Run
```bash
# Provision the host (one-time / when infra changes)
ansible-playbook -i inventory.ini playbook-provision.yml --ask-pass

# Deploy / redeploy the app (every release)
ansible-playbook -i inventory.ini playbook-deploy.yml --ask-pass
```
> `--ask-pass` uses SSH password auth. Better: add an SSH key (`ssh-copy-id root@38.242.246.126`) and drop the flag.

## Verify
```bash
curl http://38.242.246.126:18080/health
```

**Why IaC matters:** the whole server is reproducible from code — rebuild it on a fresh VPS by running two commands. Idempotent = safe to re-run; it only changes what's drifted.
