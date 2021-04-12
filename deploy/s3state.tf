# terraform block cannot contain interpolations or variables (so these are only specifec in data below)
terraform {
  backend "s3" {
    bucket = "as-gateway-terraform"
    # NOTE: terraform will create "env:/${terraform.workspace}/terraform.tfstate"
    key                     = "terraform.tfstate"
    region                  = "us-west-2"
    profile                 = "psi"
    shared_credentials_file = "$HOME/.aws/credentials"
  }
}

# remote state stored in S3:
# as long as workspaces have been created `terraform workspace new prod` the state files will be available in S3
data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket                  = "as-gateway-terraform"
    key                     = "env:/${terraform.workspace}/terraform.tfstate"
    region                  = "us-west-2"
    profile                 = "psi"
    shared_credentials_file = "$HOME/.aws/credentials"
  }
}
