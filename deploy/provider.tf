provider "aws" {
  shared_credentials_file = "$HOME/.aws/credentials"
  profile                 = "psi"
  region                  = "us-west-2"
}